import logging
import os
import re

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from openai import OpenAI
from dotenv import load_dotenv

# ---------- LOGGER ----------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)
logger = logging.getLogger(__name__)

# ---------- ENV ----------
load_dotenv(dotenv_path=".env")


class ChartGenerator:
    def __init__(self, data):
        self.data = data
        self.col_dt_list = [(col, dt) for col, dt in zip(data.columns, data.dtypes)]
        logger.info("ChartGenerator initialized")

    def generate_charts_code(self, col_dt_list, query):
        logger.info("Preparing data for LLM")

        sample_rows = self.data.head(5).to_string()
        stats = self.data.describe(include="all").to_string()

        logger.info(f"Columns detected: {col_dt_list}")

        # 🔥 Detect user intent (chart type)
        query_lower = query.lower()
        chart_hint = None

        if "bar" in query_lower:
            chart_hint = "bar"
        elif "line" in query_lower:
            chart_hint = "line"
        elif "pie" in query_lower:
            chart_hint = "pie"
        elif "scatter" in query_lower:
            chart_hint = "scatter"
        elif "histogram" in query_lower:
            chart_hint = "histogram"

        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY"),
        )

        logger.info("Calling LLM for chart generation")

        response = client.chat.completions.create(
            model="nvidia/nemotron-3-super-120b-a12b:free",
            messages=[
                {
                    "role": "system",
                    "content": """You are an expert data analyst and visualization engineer.

Your job is to generate Python code that creates interactive charts using Plotly.

The DataFrame name is: df

------------------------------------------------

OUTPUT REQUIREMENTS (STRICT)

Return ONLY executable Python code.

Each chart must:
- Use plotly.express (px) or plotly.graph_objects (go)
- Be stored in a variable named: fig
- Convert to JSON using:
    charts.append(fig.to_json())

A list named `charts` must be used to store all chart JSONs.

DO NOT:
- use matplotlib
- use seaborn
- save images
- print anything
- show charts

------------------------------------------------

USER INTENT PRIORITY RULE:

If the user explicitly specifies a chart type (bar, line, pie, etc),
ALWAYS follow the user’s requested chart type.

Do NOT override user preference based on chart rules.

------------------------------------------------

CHART RULES

trend → line chart  
comparison → bar chart  
distribution → histogram  
relationship → scatter  
proportion → pie  
multiple numeric → heatmap  

If query asks dashboard/analysis → generate 3–6 charts.

------------------------------------------------

DATA HANDLING RULE:

If the dataset contains time-based columns (date, datetime):
- ALWAYS aggregate data before plotting
- Use groupby and aggregation (sum, mean, etc.)
- NEVER plot raw unaggregated time-series data

------------------------------------------------

QUALITY RULE:

Avoid overcrowded or noisy charts.
If too many data points exist, aggregate or summarize before plotting.

------------------------------------------------

STYLE

- clean layout
- proper titles
- labels
- use default plotly hover (DO NOT disable hover)

------------------------------------------------

FINAL OUTPUT FORMAT

Example:

charts = []

fig = px.bar(df, x="col1", y="col2", title="Sales by Category")
charts.append(fig.to_json())

fig = px.line(df, x="date", y="sales", title="Sales Trend")
charts.append(fig.to_json())
"""
                },
                {
                    "role": "user",
                    "content": f"""
Columns and types:
{col_dt_list}

Sample rows:
{sample_rows}

Statistics:
{stats}

Query:
{query}

Preferred chart type: {chart_hint}
"""
                }
            ]
        )

        logger.info("LLM response received")

        return response.choices[0].message.content.strip()

    def execute_generated_code(self, generated_code):
        logger.info("Sanitizing generated code")

        # Remove markdown
        generated_code = generated_code.replace("```python", "").replace("```", "").strip()

        # Fix broken imports
        generated_code = re.sub(
            r"(import\s+[^\n]+)(import\s+)",
            r"\1\n\2",
            generated_code
        )

        # Remove all imports (we control environment)
        lines = generated_code.split("\n")
        generated_code = "\n".join(
            line for line in lines if not line.strip().startswith("import")
        )

        logger.debug(f"Sanitized code:\n{generated_code}")

        safe_globals = {
            "df": self.data,
            "pd": pd,
            "px": px,
            "go": go,
            "charts": []
        }

        try:
            logger.info("Executing generated code")

            exec(generated_code, safe_globals)

            charts = safe_globals.get("charts", [])

            if not isinstance(charts, list):
                raise RuntimeError("Generated code did not return a list")

            logger.info(f"Execution successful. Charts generated: {len(charts)}")

            return charts

        except Exception as e:
            logger.error(f"Execution failed: {str(e)}")
            logger.debug(f"Faulty code:\n{generated_code}")
            raise RuntimeError(f"Chart execution failed: {str(e)}")