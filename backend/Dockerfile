# Build from repository root: docker build -f backend/Dockerfile -t tasuku-api .
FROM python:3.14-slim
WORKDIR /service
COPY backend/requirements.lock.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY data ./data
RUN useradd --create-home appuser
USER appuser
ENV PORT=8080
ENV TASUKU_DATA_DIR=/service/data
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
