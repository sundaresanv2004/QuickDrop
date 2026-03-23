FROM python:3.12-slim

WORKDIR /app

# Install uv for fast dependency resolution
RUN pip install uv

# Copy only requirements first to cache them
COPY pyproject.toml .

# Install dependencies using uv
RUN uv pip install --system --no-cache -e .

# Copy the rest of the application
COPY . .

# Expose port 8001
EXPOSE 8001

# Run Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
