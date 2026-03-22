import logging
import os
import json

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

    # ✅ NEW: LLM returns JSON config (NOT code)
    def generate_chart_config(self, col_dt_list, query):
        logger.info("Preparing data for LLM")

        sample_rows = self.data.head(5).to_string()
        stats = self.data.describe(include="all").to_string()

        logger.info(f"Columns detected: {col_dt_list}")

        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY"),
        )

        logger.info("Calling LLM for chart config")

        response = client.chat.completions.create(
            model="nvidia/nemotron-3-super-120b-a12b:free",
            messages=[
                {
                    "role": "system",
                    "content":"""
You are an expert data analyst and visualization architect.

Your job is to generate high-quality chart configurations in JSON format for interactive Plotly visualizations.

The DataFrame name is: df

The user will provide:
1. Dataset schema (columns and types)
2. Sample rows
3. Statistical summary
4. A natural language query

Use this information to understand the dataset and generate the most relevant, meaningful, and visually effective charts.

------------------------------------------------

OUTPUT FORMAT (STRICT)

Return ONLY valid JSON. No explanation. No markdown.

Structure:

{
  "charts": [
    {
      "type": "bar | line | scatter | histogram | pie | heatmap | box",
      "x": "column_name",
      "y": "column_name",
      "layout_size": "small | medium | large",
      "color": "optional_column",
      "aggregation": "sum | mean | count | none",
      "time_granularity": "day | week | month | year | none",
      "title": "clear human-readable title"
    }
  ],
  "tables": [
    {
      "type": "pivot | summary",
      "index": "column_name",
      "columns": "optional_column",
      "values": "column_name",
      "aggregation": "sum | mean | count",
      "title": "table title"
    }
  ]
}

------------------------------------------------

DATA UNDERSTANDING RULES

Use dataset context to:
- Identify time columns (date, datetime)
- Identify categorical columns
- Identify numeric columns

Only use columns that actually exist.

Never hallucinate column names.

------------------------------------------------

QUERY INTENT INTERPRETATION

trend, growth, over time  
→ line chart

comparison, top, ranking  
→ bar chart

distribution  
→ histogram

relationship  
→ scatter

proportion  
→ pie

correlation  
→ heatmap

category distribution  
→ box plot

------------------------------------------------

DASHBOARD LOGIC

If query includes:
- dashboard
- overview
- analysis
- insights
- summary

Then:
→ Generate 3 to 6 charts (NOT more)

Ensure charts are:
- diverse (not same chart repeated)
- meaningful
- non-redundant

Never return zero charts.

------------------------------------------------

TIME-SERIES RULE (VERY IMPORTANT)

If a time column is used:

- ALWAYS aggregate data before plotting
- NEVER plot raw time-series with thousands of rows

Choose appropriate granularity:
- dense data → month
- sparse data → day
- multi-year → year

Set:
"time_granularity": "month" (or appropriate)

------------------------------------------------

AGGREGATION RULES

Use aggregation when needed:

- sales, quantity → sum
- price → mean
- counts → count

If aggregation is not needed → use "none"

------------------------------------------------

QUALITY RULES

Avoid bad charts:

- DO NOT create charts with too many categories (>20)
- DO NOT use high-cardinality columns on x-axis
- DO NOT create unreadable visuals

If needed:
→ pick top categories
→ or aggregate

------------------------------------------------

TITLE RULES

Titles must:
- be clear and readable
- describe what the chart shows

Bad: "Chart 1"  
Good: "Monthly Sales Trend"

------------------------------------------------

STRICT RULES

- ONLY return JSON
- NO Python code
- NO explanation
- NO markdown
- ALWAYS return at least 1 chart

------------------------------------------------

TABLE GENERATION RULES (STRICT)

Generate 1–2 tables ONLY if the query asks for:
- dashboard
- analysis
- insights
- summary

------------------------------------------------

TABLE TYPES

1. Pivot Table:
Used for:
- category vs category
- category vs time

Structure:
- index → categorical column (low to medium cardinality)
- columns → optional second category or time
- values → numeric column
- aggregation → sum | mean | count

2. Summary Table:
Used for:
- totals
- averages
- counts

------------------------------------------------

COLUMN SELECTION RULES

- NEVER use high-cardinality columns (e.g. IDs, names)
- Prefer:
  → category columns (ProductCategory, Country)
  → time columns (OrderDate)
  → numeric columns (Sales, Quantity)

------------------------------------------------

TIME HANDLING (IMPORTANT)

If using time column:
- ALWAYS aggregate by:
  → month (default)
  → year (if multi-year data)

Do NOT use raw timestamps

------------------------------------------------

SIZE CONTROL (VERY IMPORTANT)

- Limit rows to top 10–20 categories
- If too many categories:
  → select top values by aggregation
  → group others if needed

------------------------------------------------

QUALITY RULES

- Tables must be readable and meaningful
- Avoid empty or redundant tables
- Ensure values column is numeric

------------------------------------------------

OUTPUT REQUIREMENTS

- ALWAYS include title
- Ensure data is structured for display
- Do NOT generate more than 2 tables
"""
                },
                {
                    "role": "user",
                    "content": f"""
Columns: {col_dt_list}

Sample:
{sample_rows}

Stats:
{stats}

Query:
{query}
"""
                }
            ]
        )

        logger.info("LLM response received")

        try:
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            logger.error("Invalid JSON from LLM")
            raise RuntimeError("Failed to parse LLM response")

    # ✅ NEW: YOU control chart creation
    def build_charts_from_config(self, config):
        logger.info("Building charts from config")

        charts = []

        for chart in config.get("charts", []):
            try:
                chart_type = chart.get("type")
                x = chart.get("x")
                y = chart.get("y")
                agg = chart.get("aggregation", "none")
                title = chart.get("title", "")

                df = self.data.copy()

                time_granularity = chart.get("time_granularity", "none")

                if time_granularity != "none" and x in df.columns:
                    df[x] = pd.to_datetime(df[x], errors="coerce")

                    if time_granularity == "month":
                        df[x] = df[x].dt.to_period("M").dt.to_timestamp()

                    elif time_granularity == "year":
                        df[x] = df[x].dt.to_period("Y").dt.to_timestamp()

                    elif time_granularity == "week":
                        df[x] = df[x].dt.to_period("W").dt.to_timestamp()

                # 🔥 aggregation handling
                if agg != "none" and x and y and x in df.columns and y in df.columns:
                    df = df.groupby(x)[y].agg(agg).reset_index()

                # 🔥 chart creation
                if chart_type == "bar":
                    fig = px.bar(df, x=x, y=y, title=title)
                    fig.update_traces(marker_color="#6366F1")  # modern indigo

                elif chart_type == "line":
                    fig = px.line(df, x=x, y=y, title=title)
                    fig.update_traces(
                        line=dict(width=3, color="#22C55E"),
                        mode="lines+markers"
                    )

                elif chart_type == "scatter":
                    fig = px.scatter(df, x=x, y=y, title=title)
                    fig.update_traces(marker=dict(size=8, color="#A855F7"))

                elif chart_type == "histogram":
                    fig = px.histogram(df, x=x, title=title)


                elif chart_type == "pie":
                    fig = px.pie(df, names=x, values=y, title=title, hole=0.5)
                    fig.update_traces(
                        textinfo="percent+label",
                        marker=dict(colors=px.colors.qualitative.Set3)
                    )

                elif chart_type == "heatmap":
                    numeric_df = df.select_dtypes(include=["number"])

                    if numeric_df.shape[1] < 2:
                        logger.warning("Not enough numeric columns for a heatmap")
                        continue

                    corr = numeric_df.corr()
                    
                    # 4. Create the heatmap
                    fig = px.imshow(
                        corr, 
                        text_auto=".2f", # This adds the numbers inside the heatmap boxes
                        aspect="auto",
                        title=title,
                        color_continuous_scale="Viridis"
                    )

                elif chart_type == "box":
                    fig = px.box(df, x=x, y=y, title=title)
                    fig.update_traces(marker_color="#F59E0B")

                else:
                    logger.warning(f"Unsupported chart type: {chart_type}")
                    continue
                
                # 🎨 APPLY GLOBAL STYLING (ADD THIS BLOCK)

                fig.update_layout(
                    template="plotly_dark",

                # Use a specific dark color instead of transparent to ensure labels are seen
                    plot_bgcolor="#111827",  # Deep Charcoal/Navy
                    paper_bgcolor="#111827", # Consistent background

                    # title styling
                    title=dict(
                        x=0.5,
                        xanchor="center",
                        font=dict(size=18, color="#F9FAFB")
                    ),

                    # margins
                    margin=dict(l=40, r=40, t=60, b=40),

                    # font
                    font=dict(
                        family="Inter, sans-serif",
                        size=12,
                        color="white"
                    ),

                    # legend
                    legend=dict(
                        orientation="h",
                        y=-0.2
                    ),

                    # axes styling
                    xaxis=dict(
                        showgrid=True,
                        gridcolor="rgba(255,255,255,0.1)",
                        zeroline=False
                    ),
                    yaxis=dict(
                        showgrid=True,
                        gridcolor="rgba(255,255,255,0.1)",
                        zeroline=False
                    )
                )

                charts.append(fig.to_dict())

            except Exception as e:
                logger.error(f"Chart failed: {str(e)}")
                continue  # 🔥 don't kill entire pipeline

        logger.info(f"Charts built: {len(charts)}")

        return charts
    
    def build_tables_from_config(self, config):
        logger.info("Building tables from config")

        tables = []

        for table in config.get("tables", []):
            try:
                table_type = table.get("type")
                index = table.get("index")
                columns = table.get("columns")
                values = table.get("values")
                agg = table.get("aggregation", "sum")
                title = table.get("title", "")

                df = self.data.copy()

                if table_type == "pivot" and index and values:
                    pivot = pd.pivot_table(
                        df,
                        index=index,
                        columns=columns,
                        values=values,
                        aggfunc=agg
                    ).reset_index()

                    # ✅ CLEAN DATA
                    pivot = pivot.fillna(0)

                    # ✅ OPTIONAL: sort by main value column (if exists)
                    if values in pivot.columns:
                        pivot = pivot.sort_values(by=values, ascending=False)

                    # ✅ LIMIT ROWS (VERY IMPORTANT)
                    if pivot.shape[0] > 20:
                        pivot = pivot.head(20)

                    tables.append({
                        "title": title,
                        "data": pivot.fillna(0).to_dict(orient="records")
                    })

                elif table_type == "summary" and values:
                    summary = df[values].agg(agg)

                    tables.append({
                        "title": title,
                        "data": [{values: summary}]
                    })

            except Exception as e:
                logger.error(f"Table failed: {str(e)}")
                continue

        logger.info(f"Tables built: {len(tables)}")
        return tables