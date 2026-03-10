FROM python:3.11-slim

# Install uv dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app

# Copy project definition
COPY pyproject.toml ./

# Install dependencies (creates .venv)
RUN uv sync --no-dev --no-install-project

# Copy application code
COPY ./app ./app

# Add .venv bin to path
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

# Run using the python from the virtual environment
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
