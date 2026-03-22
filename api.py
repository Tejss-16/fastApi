# from db import charts_collection
from datetime import datetime, timezone
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import logging
import pandas as pd
import io
import json
from plotly.utils import PlotlyJSONEncoder

from generate_chart import ChartGenerator

# ---------- LOGGER ----------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)
logger = logging.getLogger(__name__)

# ---------- APP ----------
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

        # ---------- LOAD DATA ----------
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
            logger.info("CSV file loaded into DataFrame")

        elif file.filename.endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(contents))
            logger.info("Excel file loaded into DataFrame")

        else:
            logger.error("Unsupported file format")
            return JSONResponse(
                status_code=400,
                content={"error": "Unsupported file format"}
            )

        # ---------- GENERATE CHARTS ----------
        chart_generator = ChartGenerator(df)
        logger.info("ChartGenerator initialized")

        config = chart_generator.generate_chart_config(
            chart_generator.col_dt_list,
            query
        )
        logger.info("Chart config generated from LLM")

        charts = chart_generator.build_charts_from_config(config)
        logger.info(f"Charts generated successfully: {len(charts)} charts")

        tables = chart_generator.build_tables_from_config(config)
        logger.info(f"Tables generated successfully: {len(tables)} tables")

        # ---------- FIX SERIALIZATION ----------
        response_content = json.loads(
            json.dumps({"charts": charts,
                        "tables": tables
                        },
                        cls=PlotlyJSONEncoder)
        )

        return JSONResponse(content=response_content)

    except Exception as e:
        logger.exception("Error in /generate-code endpoint")

        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )