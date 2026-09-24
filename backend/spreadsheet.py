import csv
import os
from typing import Any
import pandas as pd

MONTH_COLUMNS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]


def load_sheet(path: str) -> dict[str, Any]:
    extension = os.path.splitext(path)[1].lower()
    if extension == ".csv":
        df = pd.read_csv(path, dtype=str)
    else:
        df = pd.read_excel(path, engine="openpyxl", dtype=str)
    df.columns = [str(col).strip() for col in df.columns]
    name_col = detect_name_column(df.columns.tolist())
    month_cols = [col for col in df.columns if col.strip() in MONTH_COLUMNS]
    return {
        "path": path,
        "dataframe": df.fillna("") if not df.empty else df,
        "columns": df.columns.tolist(),
        "name_column": name_col,
        "month_columns": month_cols,
        "members": df[name_col].astype(str).tolist() if name_col else [],
    }


def detect_name_column(columns: list[str]) -> str | None:
    normalized = [col.strip().lower() for col in columns]
    if "name" in normalized:
        return columns[normalized.index("name")]
    if "member name" in normalized:
        return columns[normalized.index("member name")]
    return columns[0] if columns else None


def update_month_status(sheet: dict[str, Any], member_name: str, month: str) -> dict[str, Any]:
    df = sheet["dataframe"]
    name_col = sheet["name_column"]
    month_col = month
    if month_col not in sheet["month_columns"]:
        raise ValueError(f"Month column not found: {month}")
    row_index = df[df[name_col].astype(str).str.strip().str.lower() == member_name.strip().lower()].index
    if len(row_index) == 0:
        raise ValueError("Member not found")
    row = row_index[0]
    existing_value = str(df.at[row, month_col]).strip().lower()
    already_marked = existing_value in ["true", "1", "yes", "y", "marked", "☑"]
    df.at[row, month_col] = True
    return {
        "sheet": sheet,
        "row": int(row),
        "month": month_col,
        "already_marked": already_marked,
    }


def save_sheet(sheet: dict[str, Any], destination: str) -> str:
    df = sheet["dataframe"].copy()
    extension = os.path.splitext(destination)[1].lower()
    if extension == ".csv":
        df.to_csv(destination, index=False)
    else:
        df.to_excel(destination, index=False, engine="openpyxl")
    return destination
