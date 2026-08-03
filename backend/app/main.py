from fastapi import FastAPI


app = FastAPI(
    title="Bizantino POS API",
    version="0.1.0",
)


@app.get("/")
def root():
    return {"message": "Bizantino POS API funcionando"}


@app.get("/api/health")
def health():
    return {"status": "ok"}
