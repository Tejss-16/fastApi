
# from db import charts_collection
from datetime import datetime, timezone
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)

logger = logging.getLogger(__name__)
import pandas as pd
import io
import os
import base64
import uuid


from generate_chart import ChartGenerator

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "successful"}


@app.post("/generate-code")
async def generate_code(
    file: UploadFile = File(...),
    query: str = Form(...)
):
    try:
        logger.info("Request received")

        contents = await file.read()
        logger.info(f"File received: {file.filename}")

        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
            logger.info("CSV file loaded into DataFrame")
        elif file.filename.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(contents))
            logger.info("Excel file loaded into DataFrame")
        else:
            logger.error("Unsupported file format")
            return {"error": "Unsupported file format"}

        chart_generator = ChartGenerator(df)
        logger.info("ChartGenerator initialized")

        generated_code = chart_generator.generate_charts_code(
            chart_generator.col_dt_list,
            query
        )
        logger.info("Code generated from LLM")

        charts_json = chart_generator.execute_generated_code(generated_code)
        logger.info(f"Charts generated successfully: {len(charts_json)} charts")

        return {
            "charts": charts_json
        }

    except Exception as e:
        logger.exception("Error in /generate-code endpoint")
        return {"error": str(e)}