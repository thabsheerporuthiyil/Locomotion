FROM python:3.12

WORKDIR /app

COPY requirements.txt .

RUN uv pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["celery", "-A", "Locomotion", "worker", "--loglevel=info", "--pool=solo"]