import React, { useState, useEffect } from "react";
import { useHistory } from "react-router";
import { Modal } from "../../components/Modal/Modal";
import { useAPI, WrappedResponse } from '../../providers/ApiProvider';
import { useFixedLocation, useParams } from "../../providers/RoutesProvider";
import { BemWithSpecifiContext } from "../../utils/bem";
import Plot from 'react-plotly.js';
import "./VisualizationPage.css";

const { Block, Elem } = BemWithSpecifiContext();

const downloadFile = (blob, filename) => {
  const link = document.createElement("a");

  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
};

const wait = () => new Promise((resolve) => setTimeout(resolve, 5000));

///
/// TEMPLATES FOR VISUALIZATION
///
const ModelPerformanceTemplate = ({ columns, visualizationType, onQueryChange, onVisualizationTypeChange }) => {
  const handleColumnChange = (e) => {
    const selectedColumn = e.target.value;
    const sqlQuery = `SELECT ${selectedColumn} as X, COUNT(*) as Y, GROUP_CONCAT(id, ',') as IDS FROM df GROUP BY ${selectedColumn} ORDER BY ${selectedColumn};`;
    onQueryChange(sqlQuery);
  };

  return (
    <div className="model-performance-template">
      <h1>Simple Model Performance Visualization</h1>
      <h3>Select Column for Template Query</h3>
      <label>
        Column:
        <select onChange={handleColumnChange}>
          <option value="">Select a column</option>
          {columns.map((column) => (
            <option key={column} value={column}>{column}</option>
          ))}
        </select>
      </label>
      <label>
        Visualization Type:
        <select
          value={visualizationType}
          onChange={(e) => onVisualizationTypeChange(e.target.value)}
        >
          <option value="bar">Bar</option>
          <option value="pie">Pie</option>
        </select>
      </label>
    </div>
  );
};

const ModelPerformanceByCategoryTemplate = ({ columns, visualizationType, onQueryChange, onVisualizationTypeChange }) => {
  const [column, setColumn] = useState("");
  const [categoricalColumn, setCategoricalColumn] = useState("");

  const handleColumnChange = (e) => {
    const selectedColumn = e.target.value;
    updateQuery(selectedColumn, categoricalColumn);
  };

  const handleCategoricalChange = (e) => {
    const selectedColumn = e.target.value;
    updateQuery(column, selectedColumn);
  };

  const updateQuery = (n_column, n_categoricalColumn) => {
    setColumn(n_column);
    setCategoricalColumn(n_categoricalColumn);
    if (n_column !== "" && n_categoricalColumn !== "") {
      const sqlQuery = `SELECT ${n_column} || ' ' || ${n_categoricalColumn} as X, COUNT(*) as Y, GROUP_CONCAT(id, ',') as IDS
      FROM df
      GROUP BY ${n_column}, ${n_categoricalColumn}
      ORDER BY ${n_column}, ${n_categoricalColumn};`;
      onQueryChange(sqlQuery);
    } else if (n_column !== "") {
      const sqlQuery = `SELECT ${n_column} as X, COUNT(*) as Y, GROUP_CONCAT(id, ',') as IDS FROM df GROUP BY ${n_column} ORDER BY ${n_column};`;
      onQueryChange(sqlQuery);
    }
  };

  return (
    <div className="model-performance-template">
      <h1>Model Performance by Category Visualization</h1>
      <h3>Select Column for Template Query</h3>
      <label>
        Column:
        <select onChange={handleColumnChange}>
          <option value="">Select a column for the X-axis</option>
          {columns.map((column) => (
            <option key={column} value={column}>{column}</option>
          ))}
        </select>
      </label>
      <label>
        Column for Categorical Analysis:
        <select onChange={handleCategoricalChange}>
          <option value="">Select a column for the Categorical Analysis</option>
          {columns.map((column) => (
            <option key={column} value={column}>{column}</option>
          ))}
        </select>
      </label>
      <label>
        Visualization Type:
        <select
          value={visualizationType}
          onChange={(e) => onVisualizationTypeChange(e.target.value)}
        >
          <option value="bar">Bar</option>
          <option value="pie">Pie</option>
        </select>
      </label>
    </div>
  );
};

const VisualizationDashboard = () => {
  const { id } = useParams();
  const api = useAPI();

  const [columns, setColumns] = useState([]);
  const [visualizations, setVisualizations] = useState([]);
  const [isAddingVisualization, setIsAddingVisualization] = useState(false);
  const [newVisualization, setNewVisualization] = useState({ sql_query: "", type: "bar", name: "" });
  const [ignoreKeys, setIgnoreKeys] = useState([]);
  const [visualizationData, setVisualizationData] = useState({});

  // Template mode / Advanced mode
  const [isTemplateMode, setIsTemplateMode] = useState(true); 
  const [openTemplate, setOpenTemplate] = useState("ModelPerformanceTemplate");

  // Include all tasks toggle
  const [includeAllTasks, setIncludeAllTasks] = useState(false);

  useEffect(() => {
    if (id) {
      fetchProjectData();
    }
  }, [id]);

  const fetchCategoricalColumns = async () => {
    try {
      const response = await api.callApi("dataSummary", {
        params: { pk: id },
      });
    }
    catch (error) {
      console.error("Error fetchCategoricalColumns:", error);
    }
  };

  const fetchProjectData = async () => {
    try {
      const response = await api.callApi("dataSummary", {
        params: { pk: id },
      });
  
      if (response.all_data_columns && response.created_labels) {
        const allDataColumns = Object.keys(response.all_data_columns);
        const createdLabels = Object.keys(response.created_labels);
        const unionColumns = [...new Set([...allDataColumns, ...createdLabels])];
        setColumns(unionColumns);
      } else {
        console.error("Error fetching project data:", response.error);
      }
    } catch (error) {
      console.error("Error fetching project data:", error);
    }
  };

  const fetchVisualizationData = async (sqlQuery, index) => {
    try {
      const response = await api.callApi("visualization", {
        params: { 
          pk: id, 
          ignore_keys: ignoreKeys.join(','),
          include_all_tasks: includeAllTasks
        },
        body: { sql_query: sqlQuery },
      });
      if (response && response.data) {
        setVisualizationData(prevData => ({
          ...prevData,
          [index]: response.data
        }));
      } else {
        console.error("Failed to fetch data");
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  const addVisualization = () => {
    const newIndex = visualizations.length;
    const visualizationName =
      newVisualization.name || `Visualization ${newIndex + 1}`;
  
    setVisualizations([
      ...visualizations,
      { ...newVisualization, name: visualizationName },
    ]);
    fetchVisualizationData(newVisualization.sql_query, newIndex);
    setIsAddingVisualization(false);
    setNewVisualization({ name: "", sql_query: "", type: "bar" }); // Reset fields
  };

  const updateVisualizationName = (index, newName) => {
    const updatedVisualizations = visualizations.map((viz, i) =>
      i === index ? { ...viz, name: newName } : viz
    );
    setVisualizations(updatedVisualizations);
  };

  const removeVisualization = (index) => {
    setVisualizations(visualizations.filter((_, i) => i !== index));
    setVisualizationData(prevData => {
      const newData = { ...prevData };
      delete newData[index];
      return newData;
    });
    console.log("Visualizations", visualizations);
  };

  const createFilteredDataTab = async (xValue, index) => {
    let data = visualizationData[index];
    console.log("data", data);
    let key = xValue.startsWith('num(') && xValue.endsWith(')') ? xValue.slice(4, -1) : xValue;
    const selectedData = data.filter(item => item.X === key);
    if (selectedData && selectedData[0].IDS) {
      const idsArray = selectedData[0].IDS.split(',').map(id => id.trim());

      // Separate id for exact numbers
      const idNumberFilters = idsArray.filter(id => !isNaN(id)).map(id => Number(id)); // Convert to Integer

      const filters = {
        conjunction: "or",
        items: []
      };

      // Add exact match id filters if they exist
      idNumberFilters.forEach(id => {
        filters.items.push({
          filter: "filter:tasks:id",
          operator: "equal",
          type: "Number",
          value: id
        });
      });

      // Make the API request to create the view
      const response = await api.callApi("createView", {
        body: { 
          data: { 
            filters,
            ordering: []
          },
          project: id, 
        },
      });
      
      if (response && response.id && response.project) {
        const projectId = response.project;
        const tabId = response.id;
        
        // Redirect to the URL pattern /projects/{projectId}/data?tab={tabId}
        window.location.href = `/projects/${projectId}/data?tab=${tabId}`;
      }
    } else {
      console.log(`No IDs found for selected x value (${xValue})`);
    }
  };

  return (
    <div className="visualization-dashboard">
      <div className="control-panel">
        {isAddingVisualization ? (
          <div className="add-visualization-form">
            <h3>Add Visualization</h3>
            <div className="mode-toggle">
              <button className={`button-selectable${isTemplateMode ? ' selected' : ''}`} onClick={() => setIsTemplateMode(true)}>Template Mode</button>
              <button className={`button-selectable${isTemplateMode ? '' : ' selected'}`} onClick={() => setIsTemplateMode(false)}>Advanced Mode</button>
            </div>
            {isTemplateMode ? (
              <div className="template-selection">
                <div className="template-header" onClick={() => setOpenTemplate("ModelPerformanceTemplate")}>
                  <hr style={{ margin: '20px 0', border: '1px solid #ccc' }} />
                  <h2>Model Performance Template {openTemplate === "ModelPerformanceTemplate" ? "▼" : "▶"}</h2>
                  <hr style={{ margin: '20px 0', border: '1px solid #ccc' }} />
                </div>
                {openTemplate === "ModelPerformanceTemplate" && (
                  <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '4px', marginBottom: '20px' }}>
                    <ModelPerformanceTemplate
                      columns={columns}
                      visualizationType={newVisualization.type}
                      onQueryChange={(sqlQuery) => setNewVisualization({ ...newVisualization, sql_query: sqlQuery })}
                      onVisualizationTypeChange={(visualizationType) => setNewVisualization({ ...newVisualization, type: visualizationType })}
                    />
                  </div>
                )}
                <div className="template-header" onClick={() => setOpenTemplate("ModelPerformanceByCategoryTemplate")}>
                  <h2>Model Performance by Category Template {openTemplate === "ModelPerformanceByCategoryTemplate" ? "▼" : "▶"}</h2>
                  <hr style={{ margin: '20px 0', border: '1px solid #ccc' }} />
                </div>
                {openTemplate === "ModelPerformanceByCategoryTemplate" && (
                  <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '4px', marginBottom: '20px' }}>
                    <ModelPerformanceByCategoryTemplate
                      columns={columns}
                      visualizationType={newVisualization.type}
                      onQueryChange={(sqlQuery) => setNewVisualization({ ...newVisualization, sql_query: sqlQuery })}
                      onVisualizationTypeChange={(visualizationType) => setNewVisualization({ ...newVisualization, type: visualizationType })}
                    />
                  </div>
                )}
              </div>
            ) : (
              <>
                <label>
                  SQL Query:
                  <textarea
                    value={newVisualization.sql_query}
                    onChange={(e) => setNewVisualization({ ...newVisualization, sql_query: e.target.value })}
                    placeholder="Enter your SQL query here..."
                    rows={5}
                    style={{ width: '100%' }}
                  ></textarea>
                </label>
                <label>
                  Visualization Type:
                  <select
                    value={newVisualization.type}
                    onChange={(e) => setNewVisualization({ ...newVisualization, type: e.target.value })}
                  >
                    <option value="scatter">Scatter</option>
                    <option value="bar">Bar</option>
                    <option value="pie">Pie</option>
                    <option value="heatmap">Heatmap</option>
                  </select>
                </label>
              </>
            )}
            <div className="control-panel-options">
              <div className="visualization-name-input">
                <label>
                  Name:
                  <input
                    type="text"
                    value={newVisualization.name}
                    onChange={(e) =>
                      setNewVisualization({ ...newVisualization, name: e.target.value })
                    }
                    placeholder={`Visualization ${visualizations.length + 1}`}
                  />
                </label>
              </div>
              <div className="switch-button">
                <span>Annotated Data / All Data</span>
                <input
                  className="tgl tgl-light"
                  id="switch-button-input"
                  type="checkbox"
                  checked={includeAllTasks}
                  onChange={() => setIncludeAllTasks(!includeAllTasks)}
                />
                <label className="tgl-btn" htmlFor="switch-button-input"></label>
              </div>
            </div>
            <button onClick={addVisualization}>Add</button>
            <button onClick={() => setIsAddingVisualization(false)}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setIsAddingVisualization(true)}>Add Visualization</button>
        )}
      </div>

      {Object.keys(visualizationData).length > 0 && (
        <div className="visualization-panel">
          {visualizations.map((viz, index) => {
            const data = visualizationData[index];
            if (!data) return null;

            const xData = data.map(item => item.X);
            const yData = data.map(item => item.Y);
            const zData = data[0].Z ? data.map(item => item.Z) : undefined;
            console.log("x, y, z", xData, yData, zData);
            const xDataFormatted = xData.map(item => {
              if (typeof item === 'string') {
                const numValue = parseFloat(item);
                return isNaN(numValue) ? item : `num(${numValue})`;
              }
              return item;
            });

            return (
              <div key={index} className="visualization-item">
                <input
                  type="text"
                  value={viz.name}
                  onChange={(e) => updateVisualizationName(index, e.target.value)}
                  placeholder={`Visualization ${index + 1}`}
                />
                <button onClick={() => removeVisualization(index)}>Remove</button>
                <Plot
                  data={[
                    {
                      x: xDataFormatted,
                      y: yData,
                      z: zData,
                      type: viz.type,
                      mode: viz.type === 'scatter' ? 'lines+markers' : undefined,
                    },
                  ]}
                  layout={{ title: viz.name }}
                  onClick={(event) => {
                    const point = event.points[0];
                    const xValue = point.x;
                    console.log(`Clicked on x value: ${xValue}`);
                    createFilteredDataTab(xValue, index);
                  }}
                />
                {data.length > 0 && (
                  <div className="data-table">
                    <h3>Query Results</h3>
                    <div className="table-container">
                      <table>
                        <thead>
                          <tr>
                            {Object.keys(data[0]).map((key) => (
                              <th key={key}>{key}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.map((row, idx) => (
                            <tr key={idx}>
                              {Object.values(row).map((value, index) => (
                                <td key={index}>{value}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const VisualizationPage = () => {
  const { id } = useParams();


  return (
    <Modal
      title="Project Visualization"
      className="full-screen-modal"
      closeOnClickOutside={false}
      onHide={() => window.location.href = `/projects/${id}/`}
      visible={true}
      fullscreen={true}
    >
      <VisualizationDashboard />
    </Modal>
  );
};

VisualizationPage.path = "/visualize";
VisualizationPage.modal = true;