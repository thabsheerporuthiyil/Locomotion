FROM python:3.12

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY requirements.txt .

RUN uv pip install --system --no-cache-dir -r requirements.txt

COPY . .

CMD ["celery", "-A", "Locomotion", "worker", "--loglevel=info", "--pool=solo"]
