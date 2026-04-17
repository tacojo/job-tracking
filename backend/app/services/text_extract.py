"""Extract plain text from DOCX and PDF for AI tailoring."""


def extract_docx_text(content: bytes) -> str:
    """Extract text from a DOCX file."""
    import io

    from docx import Document

    doc = Document(io.BytesIO(content))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def extract_pdf_text(content: bytes) -> str:
    """Extract text from a PDF file."""
    import io

    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(content))
    parts = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            parts.append(t)
    return "\n\n".join(parts)


def extract_text(content: bytes, file_type: str) -> str:
    """Extract plain text by file type (pdf or docx)."""
    ft = (file_type or "").lower().replace(".", "")
    if ft == "docx":
        return extract_docx_text(content)
    if ft == "pdf":
        return extract_pdf_text(content)
    return ""
