FROM python:3.11-slim

WORKDIR /app

# Copy dependency file
COPY requirements.txt ./

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY app ./app

# Create storage directory
RUN mkdir -p storage/db storage/uploads storage/exports

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
