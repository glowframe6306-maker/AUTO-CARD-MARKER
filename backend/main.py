import os
import uuid
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from ocr import process_card
from matcher import match_name, find_month_column, generate_candidates
from spreadsheet import load_sheet, update_month_status, save_sheet

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR.parent / "uploads"
CARDS_DIR = UPLOAD_DIR / "cards"
SHEETS_DIR = UPLOAD_DIR / "sheets"
OUTPUT_DIR = BASE_DIR.parent / "output"

CARDS_DIR.mkdir(parents=True, exist_ok=True)
SHEETS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Administrator Auto Card Marking API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

session_state: dict[str, Any] = {
    "sheet": None,
    "sheet_file": None,
    "cards": [],
    "results": [],
    "statistics": {
        "total_cards": 0,
        "processed": 0,
        "marked": 0,
        "already_marked": 0,
        "needs_review": 0,
        "failed": 0,
    },
}

ADMIN_TOKEN = os.getenv("ADMIN_API_TOKEN", "change-this-token")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "ChangeThisPassword")


def require_auth(token: str = Form(...)) -> bool:
    if token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return True


def ensure_sheet_loaded():
    if not session_state["sheet"]:
        raise HTTPException(status_code=400, detail="Please upload the member sheet first.")


@app.post("/login")
def login(password: str = Form(...)):
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": ADMIN_TOKEN}


@app.post("/upload-sheet")
async def upload_sheet(file: UploadFile = File(...), auth: bool = Depends(require_auth)):
    if file.content_type not in [
        "text/csv",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/octet-stream",
    ]:
        raise HTTPException(status_code=400, detail="Invalid sheet file type.")
    filename = f"sheet_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{file.filename}"
    destination = SHEETS_DIR / filename
    with destination.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    sheet = load_sheet(str(destination))
    if not sheet["name_column"] or not sheet["month_columns"]:
        raise HTTPException(status_code=400, detail="Could not detect required sheet columns.")
    session_state["sheet"] = sheet
    session_state["sheet_file"] = str(destination)
    session_state["results"] = []
    session_state["cards"] = []
    session_state["statistics"] = {
        "total_cards": 0,
        "processed": 0,
        "marked": 0,
        "already_marked": 0,
        "needs_review": 0,
        "failed": 0,
    }
    return {
        "file_name": file.filename,
        "members": len(sheet["members"]),
        "name_column": sheet["name_column"],
        "month_columns": sheet["month_columns"],
    }


@app.post("/upload-cards")
async def upload_cards(files: list[UploadFile] = File(...), auth: bool = Depends(require_auth)):
    ensure_sheet_loaded()
    accepted = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
    uploaded_files = []
    for file in files:
        if file.content_type not in accepted:
            continue
        filename = f"card_{uuid.uuid4().hex}_{file.filename}"
        destination = CARDS_DIR / filename
        with destination.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        uploaded_files.append({"filename": file.filename, "path": str(destination)})
    session_state["cards"].extend(uploaded_files)
    session_state["statistics"]["total_cards"] = len(session_state["cards"])
    return {"uploaded": [file["filename"] for file in uploaded_files]}


@app.post("/process-cards")
async def process_cards(auth: bool = Depends(require_auth)):
    ensure_sheet_loaded()
    session_state["results"] = []
    for card in session_state["cards"]:
        payload = await process_card_endpoint(card["filename"], card["path"])
        session_state["results"].append(payload)
    return {"results": session_state["results"], "statistics": session_state["statistics"]}


@app.post("/process-card")
async def process_card_endpoint(filename: str = Form(...), path: str = Form(...), auth: bool = Depends(require_auth)):
    ensure_sheet_loaded()
    try:
        ocr_data = process_card(path)
    except Exception:
        session_state["statistics"]["processed"] += 1
        session_state["statistics"]["failed"] += 1
        payload = {
            "card": filename,
            "detected_name": None,
            "detected_month": None,
            "confidence": 0,
            "status": "Failed",
            "message": "Could not read the card. Please upload a clearer image.",
            "raw_text": "",
        }
        return payload
    name = ocr_data.get("name")
    month = ocr_data.get("month")
    confidence = ocr_data.get("confidence", 0)
    if not name:
        session_state["statistics"]["processed"] += 1
        session_state["statistics"]["failed"] += 1
        return {
            "card": filename,
            "detected_name": None,
            "detected_month": month,
            "confidence": confidence,
            "status": "Needs Review",
            "message": "Member could not be identified. Please review manually.",
            "raw_text": ocr_data.get("raw_text", ""),
            "possible_matches": [],
        }
    if not month:
        session_state["statistics"]["processed"] += 1
        session_state["statistics"]["failed"] += 1
        return {
            "card": filename,
            "detected_name": name,
            "detected_month": None,
            "confidence": confidence,
            "status": "Needs Review",
            "message": "Month could not be identified. Please review manually.",
            "raw_text": ocr_data.get("raw_text", ""),
            "possible_matches": [],
        }
    match = match_name(name, session_state["sheet"]["members"])
    month_col = find_month_column(month)
    if not month_col:
        session_state["statistics"]["processed"] += 1
        session_state["statistics"]["failed"] += 1
        return {
            "card": filename,
            "detected_name": name,
            "detected_month": month,
            "confidence": confidence,
            "status": "Needs Review",
            "message": "Month could not be identified. Please review manually.",
            "raw_text": ocr_data.get("raw_text", ""),
            "possible_matches": [],
        }
    if match["status"] != "matched" or match["confidence"] < 0.8:
        session_state["statistics"]["processed"] += 1
        session_state["statistics"]["needs_review"] += 1
        return {
            "card": filename,
            "detected_name": name,
            "detected_month": month_col,
            "confidence": match["confidence"],
            "status": "Needs Review",
            "message": "Please review manually.",
            "raw_text": ocr_data.get("raw_text", ""),
            "possible_matches": generate_candidates(name, session_state["sheet"]["members"]),
        }
    try:
        update_data = update_month_status(session_state["sheet"], match["matched_name"], month_col)
    except ValueError as exc:
        session_state["statistics"]["processed"] += 1
        session_state["statistics"]["failed"] += 1
        return {
            "card": filename,
            "detected_name": name,
            "detected_month": month_col,
            "confidence": match["confidence"],
            "status": "Failed",
            "message": str(exc),
            "raw_text": ocr_data.get("raw_text", ""),
            "possible_matches": [],
        }
    session_state["statistics"]["processed"] += 1
    if update_data["already_marked"]:
        session_state["statistics"]["already_marked"] += 1
        status = "Already Marked"
    else:
        session_state["statistics"]["marked"] += 1
        status = "Marked"
    return {
        "card": filename,
        "detected_name": name,
        "detected_month": month_col,
        "matched_name": match["matched_name"],
        "confidence": match["confidence"],
        "status": status,
        "already_marked": update_data["already_marked"],
        "raw_text": ocr_data.get("raw_text", ""),
    }


@app.post("/confirm")
async def confirm(match_name: str = Form(...), month: str = Form(...), card: str = Form(...), auth: bool = Depends(require_auth)):
    ensure_sheet_loaded()
    month_col = find_month_column(month)
    if not month_col:
        raise HTTPException(status_code=400, detail="Month could not be identified. Please review manually.")
    try:
        update_data = update_month_status(session_state["sheet"], match_name, month_col)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    session_state["statistics"]["marked"] += 0 if update_data["already_marked"] else 1
    if update_data["already_marked"]:
        session_state["statistics"]["already_marked"] += 1
    return {
        "card": card,
        "matched_name": match_name,
        "month": month_col,
        "already_marked": update_data["already_marked"],
    }


@app.get("/status")
async def status(auth_token: str):
    return {
        "sheet_loaded": bool(session_state["sheet"]),
        "statistics": session_state["statistics"],
        "results": session_state["results"],
    }


@app.get("/download")
async def download(auth_token: str):
    ensure_sheet_loaded()
    destination = OUTPUT_DIR / f"updated_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.xlsx"
    save_sheet(session_state["sheet"], str(destination))
    return FileResponse(path=str(destination), filename=destination.name, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
