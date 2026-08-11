# Administrator Auto Card Marking

A complete administrator dashboard for automatically detecting member names and months from uploaded card images, matching them against a member spreadsheet, and marking the corresponding month as completed.

## Project structure

```
ADMINISTRATOR-AUTO-CARD-MARKING/
│
├── frontend/
├── backend/
├── uploads/
│   ├── cards/
│   └── sheets/
├── output/
├── sample-member-sheet.csv
├── README.md
└── .gitignore
```

## Installation

### Windows prerequisites

1. Install Python 3.11+ from https://www.python.org/downloads/windows/
2. Install Node.js 20+ from https://nodejs.org/
3. Install Tesseract OCR:
   - Download from https://github.com/tesseract-ocr/tesseract/releases
   - Install and add the Tesseract installation folder to your `PATH`
   - Example path: `C:\Program Files\Tesseract-OCR`

### Backend setup

Open PowerShell in the project root directory and run:

```powershell
cd C:\Users\Administrator\ADMINISTRATOR-AUTO-CARD-MARKING
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Create a `.env` file in the project root by copying `.env.example` and update values as needed.

### Frontend setup

Open a new terminal in the frontend folder and run:

```powershell
cd C:\Users\Administrator\ADMINISTRATOR-AUTO-CARD-MARKING\frontend
npm install
```

## Running the application

### Start the backend

```powershell
cd C:\Users\Administrator\ADMINISTRATOR-AUTO-CARD-MARKING\backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Start the frontend

```powershell
cd C:\Users\Administrator\ADMINISTRATOR-AUTO-CARD-MARKING\frontend
npm run dev
```

The dashboard will be available at `http://localhost:3000`.

## Tesseract OCR notes

- Make sure `tesseract` is available in your system `PATH`.
- If `pytesseract` cannot find Tesseract, set `TESSERACT_CMD` in `.env` to the full executable path.

## Sample spreadsheet

`sample-member-sheet.csv` is included to test member imports.

## Sample card format recommendations

Supported card text patterns include:

- `NAME: M.I. MUHAMMADH`
- `MONTH: AUGUST`
- `Member Name - M.I. MUHAMMADH`
- `August`

The system can normalize uppercase/lowercase, abbreviations, punctuation, and minor OCR errors.

## Backend API endpoints

- `POST /upload-sheet`
- `POST /upload-cards`
- `POST /process-card`
- `POST /process-cards`
- `POST /confirm`
- `GET /status`
- `GET /download`
- `POST /login`

## Important behavior

- The system does not expose uploaded files publicly.
- The backend validates file types and limits uploads.
- Only the required month is updated; existing month values remain unchanged.
