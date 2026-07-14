"""
Streamlit UI — talks to the Cline SDK through the `cline_py` package. NO server.

There is no Node server, no HTTP, no port. `cline_py` spawns Node under the hood per
call and returns a dict. This whole app is the thing you ship.

Run:
    pip install -e .            # installs cline_py + a bundled Node 22 (nodejs-wheel)
    pip install streamlit
    streamlit run examples/streamlit_app.py
"""
import streamlit as st
import cline_py

st.set_page_config(page_title="cline-testgen", page_icon="🧪", layout="wide")
st.title("🧪 Spring Boot test generator")
st.caption("No server — this Streamlit app calls the Cline SDK directly via `cline_py`.")

# --- Sidebar: connection check --------------------------------------------
with st.sidebar:
    st.header("Model")
    if st.button("Check config"):
        try:
            st.json(cline_py.config())
        except cline_py.ClineError as e:
            st.error(str(e))
    timeout = st.number_input("Timeout (s)", 60, 3600, 900, 60,
                              help="Agentic runs make several model calls; Gemma on CPU is slow.")

# --- Inputs ----------------------------------------------------------------
project_root = st.text_input("Project root", "examples/springboot-sample")
c1, c2 = st.columns(2)
java_path = c1.text_input("Java class (relative)", "src/main/java/com/example/demo/Calculator.java")
test_path = c2.text_input("Test file (relative)", "src/test/java/com/example/demo/CalculatorTest.java")
extra = st.text_area("Extra instructions (optional)", "", height=70)
write_back = st.checkbox("✍️ Write the generated test file back to disk", value=False)

if st.button("Generate tests", type="primary"):
    with st.spinner("Cline is reading the code and generating tests… (minutes on CPU)"):
        try:
            data = cline_py.generate_tests(
                project_root=project_root,
                java_path=java_path,
                test_path=test_path,
                write=write_back,
                extra=extra,
                timeout=timeout,
            )
        except cline_py.ClineError as e:
            st.error(str(e))
            st.stop()

    if not data.get("ok"):
        st.error(data.get("error", "unknown error"))

    cols = st.columns(4)
    cols[0].metric("Status", data.get("status", "-"))
    cols[1].metric("Iterations", data.get("iterations", "-"))
    dur = data.get("durationMs")
    cols[2].metric("Duration", f"{dur/1000:.1f}s" if isinstance(dur, (int, float)) else "-")
    tools = [t.get("name") for t in data.get("toolCalls", [])]
    cols[3].metric("Tool calls", len(tools))
    if tools:
        st.caption("🛠️ " + ", ".join(tools) + (" — wrote file ✅" if data.get("wroteFile") else ""))

    st.subheader("Generated tests")
    st.code(data.get("outputText", "") or "(empty)", language="java")
    with st.expander("Raw result"):
        st.json(data)
