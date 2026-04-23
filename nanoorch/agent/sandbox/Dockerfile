FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs \
    npm \
    ruby \
    r-base \
    golang \
    default-jdk \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir "numpy" "pandas" "requests" "lxml>=6.1.0"

WORKDIR /sandbox

RUN useradd -m -u 1001 sandbox && chown sandbox:sandbox /sandbox

USER sandbox

COPY --chown=sandbox:sandbox runner.py /sandbox/runner.py

CMD ["python", "/sandbox/runner.py"]
