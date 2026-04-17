"""Parse CV DOCX/PDF into structured experience data."""

import json
import re
from typing import Any

from app.config import settings
from app.services.text_extract import extract_text


def _parse_with_openai(text: str) -> list[dict[str, Any]]:
    """Use OpenAI to extract structured work experience from CV text."""
    if not settings.openai_api_key:
        return []
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    system_prompt = """You extract work experience from a CV/resume. Return a JSON array of objects.
Each object must have: employer, role, start_date, end_date, location, employment_type, level, skills (array), details (array of bullet points).
Optional: employer_link (URL), flag (2-letter country code like gb, ro), duration (e.g. Permanent).
Dates: use format like "Oct 2022", "Feb 2023", "Mar 2020".
employment_type: e.g. "Full time", "Part time", "Contract".
level: e.g. "Mid level", "Senior level", "Junior".
location: e.g. "London, United Kingdom".
Return ONLY valid JSON array, no other text."""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"Extract all work experience from this CV:\n\n{text[:12000]}",
            },
        ],
        max_tokens=4000,
    )
    raw = (response.choices[0].message.content or "").strip()
    # Strip markdown code blocks if present
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return data
        return [data] if isinstance(data, dict) else []
    except json.JSONDecodeError:
        return []


def _parse_heuristic(text: str) -> list[dict[str, Any]]:
    """Fallback: heuristic extraction from CV text."""
    experiences = []
    # Look for date patterns (e.g. "Oct 2022 - Feb 2023", "2020 - 2022")
    date_pattern = re.compile(
        r"(\w+\s+\d{4}|\d{4})\s*[-–—]\s*(\w+\s+\d{4}|\d{4}|present|current)",
        re.I,
    )
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    i = 0
    while i < len(lines):
        line = lines[i]
        # Skip section headers
        if re.match(
            r"^(experience|work\s+history|employment|professional\s+experience)$",
            line,
            re.I,
        ):
            i += 1
            continue
        m = date_pattern.search(line)
        if m:
            start_date = m.group(1)
            end_date = m.group(2)
            # Previous line often has role/company
            prev = lines[i - 1] if i > 0 else ""
            # Try to split "Role at Company" or "Company - Role"
            role, employer = "", ""
            if " at " in prev.lower():
                parts = prev.split(" at ", 1)
                role, employer = (
                    (parts[0].strip(), parts[1].strip())
                    if len(parts) == 2
                    else (prev, "")
                )
            elif " - " in prev or " – " in prev:
                parts = re.split(r"\s+[-–]\s+", prev, maxsplit=1)
                role, employer = (
                    (parts[0].strip(), parts[1].strip())
                    if len(parts) == 2
                    else (prev, "")
                )
            else:
                role = prev or line[:50]
            # Collect bullet points until next date block
            details = []
            j = i + 1
            while (
                j < len(lines)
                and not date_pattern.search(lines[j])
                and not re.match(
                    r"^(education|skills|summary|profile)$", lines[j], re.I
                )
            ):
                bullet = lines[j].strip()
                if bullet and not bullet.startswith("—") and len(bullet) > 10:
                    details.append(bullet.lstrip("•-* "))
                j += 1
            experiences.append(
                {
                    "employer": employer or "Unknown",
                    "employer_link": "",
                    "role": role or "Unknown",
                    "start_date": start_date,
                    "end_date": end_date,
                    "flag": "gb",
                    "location": "",
                    "employment_type": "Full time",
                    "duration": "Permanent",
                    "level": "Mid level",
                    "skills": [],
                    "details": details,
                }
            )
        i += 1
    return experiences


def parse_cv(
    content: bytes, file_type: str
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """
    Parse CV file into structured experience list and profile dict.
    Returns (experiences, profile) where profile has full_name, tagline, summary.
    """
    text = extract_text(content, file_type)
    if not text:
        return [], {}

    profile: dict[str, str] = {}
    # Extract first line as possible name
    first_lines = [ln.strip() for ln in text.split("\n") if ln.strip()][:5]
    if first_lines:
        profile["full_name"] = first_lines[0][:255]
        for line in first_lines[1:3]:
            if len(line) < 100 and (
                "engineer" in line.lower() or "analyst" in line.lower()
            ):
                profile["tagline"] = line[:255]
                break

    experiences = _parse_with_openai(text)
    if not experiences:
        experiences = _parse_heuristic(text)

    # Normalise each experience
    for exp in experiences:
        exp.setdefault("employer", "Unknown")
        exp.setdefault("employer_link", "")
        exp.setdefault("role", "Unknown")
        exp.setdefault("start_date", "")
        exp.setdefault("end_date", "")
        exp.setdefault("flag", "gb")
        exp.setdefault("location", "")
        exp.setdefault("employment_type", "Full time")
        exp.setdefault("duration", "Permanent")
        exp.setdefault("level", "Mid level")
        exp.setdefault("skills", [])
        exp.setdefault("details", [])
        if not isinstance(exp["skills"], list):
            exp["skills"] = [s for s in str(exp["skills"]).split(",") if s.strip()]
        if not isinstance(exp["details"], list):
            exp["details"] = [str(exp["details"])] if exp["details"] else []

    return experiences, profile
