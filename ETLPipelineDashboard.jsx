import React, { useState, useMemo } from 'react';
import { Upload, Database, CheckCircle, AlertCircle, BarChart3, Download, TrendingUp, Activity, AlertTriangle, Info, FileText, PieChart } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart as RePieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const ETLPipelineDashboard = () => {
  const [rawData, setRawData] = useState(null);
  const [transformedData, setTransformedData] = useState(null);
  const [storedData, setStoredData] = useState(null);
  const [stats, setStats] = useState(null);
  const [qualityReport, setQualityReport] = useState(null);
  const [activeTab, setActiveTab] = useState('upload');
  const [transformConfig, setTransformConfig] = useState({
    removeNulls: true,
    removeDuplicates: false,
    columnsToRename: {},
    dataTypeChanges: {},
    fillNullStrategy: {},
    filterConditions: [],
    sortColumn: '',
    sortOrder: 'asc',
    columnsToKeep: [],
    derivedColumns: []
  });
  const [uploadError, setUploadError] = useState('');

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

  const parseCSV = (text) => {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || null;
      });
      rows.push(row);
    }

    return { headers, rows };
  };

  const performDataQualityCheck = (data) => {
    const { headers, rows } = data;
    const report = {
      totalRows: rows.length,
      totalColumns: headers.length,
      columns: {}
    };

    headers.forEach(header => {
      const values = rows.map(row => row[header]);
      const nonNullValues = values.filter(v => v !== null && v !== '' && v !== 'null' && v !== 'NULL');
      const nullCount = values.length - nonNullValues.length;
      const uniqueValues = new Set(nonNullValues);

      // Detect data type
      const numericValues = nonNullValues.filter(v => !isNaN(parseFloat(v)));
      const isNumeric = numericValues.length > nonNullValues.length * 0.8;

      // Calculate statistics
      let min = null, max = null, avg = null;
      if (isNumeric && numericValues.length > 0) {
        const numbers = numericValues.map(v => parseFloat(v));
        min = Math.min(...numbers);
        max = Math.max(...numbers);
        avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
      }

      report.columns[header] = {
        nullCount,
        nullPercentage: ((nullCount / values.length) * 100).toFixed(2),
        uniqueCount: uniqueValues.size,
        dataType: isNumeric ? 'numeric' : 'text',
        completeness: (((values.length - nullCount) / values.length) * 100).toFixed(2),
        ...(isNumeric && { min, max, avg: avg.toFixed(2) }),
        topValues: Array.from(uniqueValues).slice(0, 5)
      };
    });

    // Calculate overall quality score
    const avgCompleteness = Object.values(report.columns)
      .reduce((sum, col) => sum + parseFloat(col.completeness), 0) / headers.length;

    report.qualityScore = avgCompleteness.toFixed(2);
    report.issues = [];

    // Identify issues
    Object.entries(report.columns).forEach(([col, data]) => {
      if (parseFloat(data.nullPercentage) > 20) {
        report.issues.push({
          severity: 'high',
          column: col,
          message: `High null percentage: ${data.nullPercentage}%`
        });
      }
      if (data.uniqueCount === 1) {
        report.issues.push({
          severity: 'medium',
          column: col,
          message: 'Column has only one unique value'
        });
      }
    });

    return report;
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadError('');

    try {
      const text = await file.text();
      const { headers, rows } = parseCSV(text);

      setRawData({ headers, rows });

      const quality = performDataQualityCheck({ headers, rows });
      setQualityReport(quality);

      setStats({
        rawRowCount: rows.length,
        rawColumnCount: headers.length,
        nullCount: countNulls(rows)
      });
      setActiveTab('raw');
    } catch (error) {
      setUploadError('Error parsing file. Please ensure it\'s a valid CSV.');
    }
  };

  const countNulls = (rows) => {
    let count = 0;
    rows.forEach(row => {
      Object.values(row).forEach(val => {
        if (val === null || val === '' || val === 'null' || val === 'NULL') count++;
      });
    });
    return count;
  };

  const applyTransformations = () => {
    if (!rawData) return;

    let transformed = [...rawData.rows];
    let headers = [...rawData.headers];

    // 1. Remove duplicates
    if (transformConfig.removeDuplicates) {
      const seen = new Set();
      transformed = transformed.filter(row => {
        const key = JSON.stringify(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    // 2. Fill null values
    if (Object.keys(transformConfig.fillNullStrategy).length > 0) {
      Object.entries(transformConfig.fillNullStrategy).forEach(([col, strategy]) => {
        if (strategy === 'mean') {
          const values = transformed
            .map(row => parseFloat(row[col]))
            .filter(v => !isNaN(v));
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          transformed = transformed.map(row => ({
            ...row,
            [col]: (row[col] === null || row[col] === '' || row[col] === 'null') ? mean.toFixed(2) : row[col]
          }));
        } else if (strategy === 'median') {
          const values = transformed
            .map(row => parseFloat(row[col]))
            .filter(v => !isNaN(v))
            .sort((a, b) => a - b);
          const median = values[Math.floor(values.length / 2)];
          transformed = transformed.map(row => ({
            ...row,
            [col]: (row[col] === null || row[col] === '' || row[col] === 'null') ? median : row[col]
          }));
        } else if (strategy === 'mode') {
          const frequency = {};
          transformed.forEach(row => {
            const val = row[col];
            if (val && val !== 'null' && val !== '') {
              frequency[val] = (frequency[val] || 0) + 1;
            }
          });
          const mode = Object.keys(frequency).reduce((a, b) =>
            frequency[a] > frequency[b] ? a : b
          );
          transformed = transformed.map(row => ({
            ...row,
            [col]: (row[col] === null || row[col] === '' || row[col] === 'null') ? mode : row[col]
          }));
        } else if (strategy === 'zero') {
          transformed = transformed.map(row => ({
            ...row,
            [col]: (row[col] === null || row[col] === '' || row[col] === 'null') ? '0' : row[col]
          }));
        } else if (strategy.startsWith('custom:')) {
          const customValue = strategy.split(':')[1];
          transformed = transformed.map(row => ({
            ...row,
            [col]: (row[col] === null || row[col] === '' || row[col] === 'null') ? customValue : row[col]
          }));
        }
      });
    }

    // 3. Remove rows with nulls (after filling)
    if (transformConfig.removeNulls) {
      transformed = transformed.filter(row =>
        !Object.values(row).some(val => val === null || val === '' || val === 'null' || val === 'NULL')
      );
    }

    // 4. Apply filter conditions
    if (transformConfig.filterConditions.length > 0) {
      transformConfig.filterConditions.forEach(filter => {
        if (filter.column && filter.operator && filter.value !== '') {
          transformed = transformed.filter(row => {
            const cellValue = row[filter.column];
            const filterValue = filter.value;

            switch (filter.operator) {
              case 'equals':
                return cellValue == filterValue;
              case 'not_equals':
                return cellValue != filterValue;
              case 'contains':
                return String(cellValue).toLowerCase().includes(String(filterValue).toLowerCase());
              case 'greater_than':
                return parseFloat(cellValue) > parseFloat(filterValue);
              case 'less_than':
                return parseFloat(cellValue) < parseFloat(filterValue);
              case 'greater_equal':
                return parseFloat(cellValue) >= parseFloat(filterValue);
              case 'less_equal':
                return parseFloat(cellValue) <= parseFloat(filterValue);
              default:
                return true;
            }
          });
        }
      });
    }

    // 5. Select specific columns
    if (transformConfig.columnsToKeep.length > 0) {
      headers = transformConfig.columnsToKeep;
      transformed = transformed.map(row => {
        const newRow = {};
        transformConfig.columnsToKeep.forEach(col => {
          newRow[col] = row[col];
        });
        return newRow;
      });
    }

    // 6. Rename columns
    if (Object.keys(transformConfig.columnsToRename).length > 0) {
      transformed = transformed.map(row => {
        const newRow = {};
        Object.keys(row).forEach(key => {
          const newKey = transformConfig.columnsToRename[key] || key;
          newRow[newKey] = row[key];
        });
        return newRow;
      });

      headers = headers.map(h => transformConfig.columnsToRename[h] || h);
    }

    // 7. Apply data type changes
    if (Object.keys(transformConfig.dataTypeChanges).length > 0) {
      transformed = transformed.map(row => {
        const newRow = { ...row };
        Object.keys(transformConfig.dataTypeChanges).forEach(col => {
          const targetType = transformConfig.dataTypeChanges[col];
          if (targetType === 'number') {
            newRow[col] = parseFloat(newRow[col]) || 0;
          } else if (targetType === 'boolean') {
            newRow[col] = newRow[col] === 'true' || newRow[col] === '1';
          } else if (targetType === 'uppercase') {
            newRow[col] = String(newRow[col]).toUpperCase();
          } else if (targetType === 'lowercase') {
            newRow[col] = String(newRow[col]).toLowerCase();
          } else if (targetType === 'trim') {
            newRow[col] = String(newRow[col]).trim();
          }
        });
        return newRow;
      });
    }

    // 8. Add derived columns
    if (transformConfig.derivedColumns.length > 0) {
      transformConfig.derivedColumns.forEach(derived => {
        if (derived.name && derived.formula) {
          const [col1, operator, col2] = derived.formula.split(' ');
          transformed = transformed.map(row => {
            let result = 0;
            const val1 = parseFloat(row[col1]) || 0;
            const val2 = parseFloat(row[col2]) || 0;

            switch (operator) {
              case '+':
                result = val1 + val2;
                break;
              case '-':
                result = val1 - val2;
                break;
              case '*':
                result = val1 * val2;
                break;
              case '/':
                result = val2 !== 0 ? val1 / val2 : 0;
                break;
              default:
                result = 0;
            }

            return { ...row, [derived.name]: result.toFixed(2) };
          });
        }
      });

      // Add derived column names to headers
      transformConfig.derivedColumns.forEach(derived => {
        if (derived.name && !headers.includes(derived.name)) {
          headers.push(derived.name);
        }
      });
    }

    // 9. Sort data
    if (transformConfig.sortColumn) {
      transformed.sort((a, b) => {
        const aVal = a[transformConfig.sortColumn];
        const bVal = b[transformConfig.sortColumn];

        // Try numeric comparison first
        const aNum = parseFloat(aVal);
        const bNum = parseFloat(bVal);

        if (!isNaN(aNum) && !isNaN(bNum)) {
          return transformConfig.sortOrder === 'asc' ? aNum - bNum : bNum - aNum;
        }

        // Fallback to string comparison
        const comparison = String(aVal).localeCompare(String(bVal));
        return transformConfig.sortOrder === 'asc' ? comparison : -comparison;
      });
    }

    setTransformedData({ headers, rows: transformed });
    setStats(prev => ({
      ...prev,
      transformedRowCount: transformed.length,
      transformedColumnCount: headers.length,
      rowsRemoved: prev.rawRowCount - transformed.length
    }));
    setActiveTab('transformed');
  };

  const storeToDatabase = () => {
    if (!transformedData) return;

    setStoredData({
      tableName: 'processed_data',
      database: 'sqlite',
      timestamp: new Date().toISOString(),
      ...transformedData
    });
    setActiveTab('stored');
  };

  const downloadData = (data, filename) => {
    if (!data) return;

    const csv = [
      data.headers.join(','),
      ...data.rows.map(row => data.headers.map(h => row[h] || '').join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  const addColumnRename = (oldName, newName) => {
    setTransformConfig(prev => ({
      ...prev,
      columnsToRename: { ...prev.columnsToRename, [oldName]: newName }
    }));
  };

  const addDataTypeChange = (column, type) => {
    setTransformConfig(prev => ({
      ...prev,
      dataTypeChanges: { ...prev.dataTypeChanges, [column]: type }
    }));
  };

  const setFillNullStrategy = (column, strategy) => {
    setTransformConfig(prev => ({
      ...prev,
      fillNullStrategy: { ...prev.fillNullStrategy, [column]: strategy }
    }));
  };

  const addFilterCondition = () => {
    setTransformConfig(prev => ({
      ...prev,
      filterConditions: [...prev.filterConditions, { column: '', operator: '', value: '' }]
    }));
  };

  const updateFilterCondition = (index, field, value) => {
    setTransformConfig(prev => {
      const newConditions = [...prev.filterConditions];
      newConditions[index] = { ...newConditions[index], [field]: value };
      return { ...prev, filterConditions: newConditions };
    });
  };

  const removeFilterCondition = (index) => {
    setTransformConfig(prev => ({
      ...prev,
      filterConditions: prev.filterConditions.filter((_, i) => i !== index)
    }));
  };

  const toggleColumnSelection = (column) => {
    setTransformConfig(prev => {
      const columns = prev.columnsToKeep.includes(column)
        ? prev.columnsToKeep.filter(c => c !== column)
        : [...prev.columnsToKeep, column];
      return { ...prev, columnsToKeep: columns };
    });
  };

  const addDerivedColumn = () => {
    setTransformConfig(prev => ({
      ...prev,
      derivedColumns: [...prev.derivedColumns, { name: '', formula: '' }]
    }));
  };

  const updateDerivedColumn = (index, field, value) => {
    setTransformConfig(prev => {
      const newDerived = [...prev.derivedColumns];
      newDerived[index] = { ...newDerived[index], [field]: value };
      return { ...prev, derivedColumns: newDerived };
    });
  };

  const removeDerivedColumn = (index) => {
    setTransformConfig(prev => ({
      ...prev,
      derivedColumns: prev.derivedColumns.filter((_, i) => i !== index)
    }));
  };

  // Generate chart data
  const chartData = useMemo(() => {
    if (!rawData) return null;

    const data = rawData;
    const numericColumns = data.headers.filter(header => {
      const values = data.rows.map(row => row[header]).filter(v => v);
      return values.length > 0 && !isNaN(parseFloat(values[0]));
    });

    if (numericColumns.length === 0) return null;

    // Line/Bar chart data
    const lineData = data.rows.slice(0, 20).map((row, idx) => {
      const point = { index: idx + 1 };
      numericColumns.forEach(col => {
        point[col] = parseFloat(row[col]) || 0;
      });
      return point;
    });

    // Pie chart for null distribution
    const nullData = data.headers.map(header => ({
      name: header,
      value: data.rows.filter(row =>
        row[header] === null || row[header] === '' || row[header] === 'null'
      ).length
    })).filter(item => item.value > 0);

    return { lineData, numericColumns, nullData };
  }, [rawData]);

  const renderDataTable = (data, title) => {
    if (!data) return null;

    return (
      <div className="glass-card rounded-2xl p-6 border border-white/20">
        <h3 className="text-xl font-bold mb-4 text-white/90 tracking-tight">{title}</h3>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm">
            <thead className="bg-white/10 backdrop-blur-md">
              <tr>
                {data.headers.map((header, i) => (
                  <th key={i} className="px-4 py-3 text-left font-semibold text-white/90 first:rounded-l-lg last:rounded-r-lg">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.rows.slice(0, 10).map((row, i) => (
                <tr key={i} className="hover:bg-white/5 transition-colors">
                  {data.headers.map((header, j) => (
                    <td key={j} className="px-4 py-3 text-slate-300">
                      {row[header] === null || row[header] === '' ?
                        <span className="text-pink-400 italic font-medium">null</span> :
                        String(row[header])
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {data.rows.length > 10 && (
            <p className="text-sm text-slate-400 mt-4 text-center font-medium">
              Showing 10 of {data.rows.length} rows
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen p-6 font-['Outfit']">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Enhanced Header */}
        <div className="text-center py-10 relative">
          <div className="absolute inset-0 bg-blue-500/20 blur-[100px] rounded-full pointer-events-none transform -translate-y-1/2"></div>
          <div className="relative z-10">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl mb-6 shadow-2xl shadow-blue-500/30 transform hover:scale-110 transition-transform duration-500 border border-white/20">
              <Database className="w-12 h-12 text-white drop-shadow-md" />
            </div>
            <h1 className="text-6xl font-bold bg-gradient-to-r from-white via-blue-100 to-indigo-200 bg-clip-text text-transparent mb-4 tracking-tight drop-shadow-sm">
              ETL Pipeline Dashboard
            </h1>
            <p className="text-slate-300 text-xl font-light max-w-2xl mx-auto">
              Extract, Transform, Load - with Data Quality & Visualization
            </p>
          </div>
        </div>

        {/* Enhanced Pipeline Flow */}
        {/* Enhanced Pipeline Flow */}
        <div className="glass-card rounded-3xl p-10 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-50"></div>
          <div className="flex items-center justify-between relative z-10">
            <div className={`flex-1 text-center transition-all duration-500 ${rawData ? 'opacity-100 scale-100' : 'opacity-60 scale-95'}`}>
              <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 shadow-lg transition-all duration-300 ${rawData ? 'bg-blue-600 text-white shadow-blue-500/40' : 'bg-slate-800/50 text-slate-500'}`}>
                <Upload className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-white text-xl">Extract</h3>
              <p className="text-sm text-slate-400 mt-1">Upload Data</p>
            </div>

            <div className="flex-1 hidden md:flex items-center justify-center px-4">
              <div className="h-1 w-full bg-slate-700/50 rounded-full relative overflow-hidden">
                <div className={`absolute top-0 left-0 h-full bg-blue-500 transition-all duration-1000 ${rawData ? 'w-full' : 'w-0'}`}></div>
              </div>
            </div>

            <div className={`flex-1 text-center transition-all duration-500 ${transformedData ? 'opacity-100 scale-100' : 'opacity-60 scale-95'}`}>
              <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 shadow-lg transition-all duration-300 ${transformedData ? 'bg-emerald-500 text-white shadow-emerald-500/40' : 'bg-slate-800/50 text-slate-500'}`}>
                <CheckCircle className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-white text-xl">Transform</h3>
              <p className="text-sm text-slate-400 mt-1">Clean & Process</p>
            </div>

            <div className="flex-1 hidden md:flex items-center justify-center px-4">
              <div className="h-1 w-full bg-slate-700/50 rounded-full relative overflow-hidden">
                <div className={`absolute top-0 left-0 h-full bg-emerald-500 transition-all duration-1000 ${transformedData ? 'w-full' : 'w-0'}`}></div>
              </div>
            </div>

            <div className={`flex-1 text-center transition-all duration-500 ${storedData ? 'opacity-100 scale-100' : 'opacity-60 scale-95'}`}>
              <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 shadow-lg transition-all duration-300 ${storedData ? 'bg-purple-600 text-white shadow-purple-500/40' : 'bg-slate-800/50 text-slate-500'}`}>
                <Database className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-white text-xl">Load</h3>
              <p className="text-sm text-slate-400 mt-1">Store to DB</p>
            </div>
          </div>
        </div>

        {/* Enhanced Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="glass-card rounded-2xl p-6 text-white transform hover:scale-105 transition-transform border border-blue-500/30 bg-blue-500/10">
              <div className="flex items-center justify-between mb-4">
                <BarChart3 className="w-10 h-10 text-blue-400 opacity-80" />
                <div className="text-right">
                  <p className="text-sm text-blue-200">Raw Rows</p>
                  <p className="text-4xl font-bold bg-gradient-to-r from-blue-200 to-white bg-clip-text text-transparent">{stats.rawRowCount}</p>
                </div>
              </div>
              <div className="h-1 bg-blue-900/50 rounded-full overflow-hidden">
                <div className="h-full bg-blue-400 w-full shadow-[0_0_10px_rgba(96,165,250,0.5)]"></div>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-6 text-white transform hover:scale-105 transition-transform border border-red-500/30 bg-red-500/10">
              <div className="flex items-center justify-between mb-4">
                <AlertCircle className="w-10 h-10 text-red-400 opacity-80" />
                <div className="text-right">
                  <p className="text-sm text-red-200">Null Values</p>
                  <p className="text-4xl font-bold bg-gradient-to-r from-red-200 to-white bg-clip-text text-transparent">{stats.nullCount}</p>
                </div>
              </div>
              <div className="h-1 bg-red-900/50 rounded-full overflow-hidden">
                <div className="h-full bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.5)]" style={{ width: `${(stats.nullCount / (stats.rawRowCount * stats.rawColumnCount || 1)) * 100}%` }}></div>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-6 text-white transform hover:scale-105 transition-transform border border-emerald-500/30 bg-emerald-500/10">
              <div className="flex items-center justify-between mb-4">
                <CheckCircle className="w-10 h-10 text-emerald-400 opacity-80" />
                <div className="text-right">
                  <p className="text-sm text-emerald-200">Processed</p>
                  <p className="text-4xl font-bold bg-gradient-to-r from-emerald-200 to-white bg-clip-text text-transparent">{stats.transformedRowCount || 0}</p>
                </div>
              </div>
              <div className="h-1 bg-emerald-900/50 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" style={{ width: stats.transformedRowCount ? '100%' : '0%' }}></div>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-6 text-white transform hover:scale-105 transition-transform border border-orange-500/30 bg-orange-500/10">
              <div className="flex items-center justify-between mb-4">
                <AlertTriangle className="w-10 h-10 text-orange-400 opacity-80" />
                <div className="text-right">
                  <p className="text-sm text-orange-200">Removed</p>
                  <p className="text-4xl font-bold bg-gradient-to-r from-orange-200 to-white bg-clip-text text-transparent">{stats.rowsRemoved || 0}</p>
                </div>
              </div>
              <div className="h-1 bg-orange-900/50 rounded-full overflow-hidden">
                <div className="h-full bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.5)]" style={{ width: stats.rowsRemoved ? `${(stats.rowsRemoved / stats.rawRowCount) * 100}%` : '0%' }}></div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="glass-panel rounded-2xl shadow-2xl mb-8 overflow-hidden border border-white/10">
          <div className="flex border-b border-white/10 p-1 bg-black/20 backdrop-blur-xl">
            {[
              { key: 'upload', label: 'Upload', icon: Upload },
              { key: 'raw', label: 'Raw Data', icon: FileText },
              { key: 'quality', label: 'Quality Check', icon: Activity },
              { key: 'visualize', label: 'Visualize', icon: BarChart3 },
              { key: 'transform', label: 'Transform', icon: CheckCircle },
              { key: 'transformed', label: 'Transformed', icon: Database },
              { key: 'stored', label: 'Stored', icon: CheckCircle }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === tab.key
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <Icon className={`w-4 h-4 ${activeTab === tab.key ? 'text-blue-400' : ''}`} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="p-8 min-h-[500px]">
            {/* Upload Tab */}
            {activeTab === 'upload' && (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-3xl mb-6 border border-blue-500/30 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
                  <Upload className="w-12 h-12 text-blue-400" />
                </div>
                <h3 className="text-3xl font-bold mb-3 text-white">Upload Your Dataset</h3>
                <p className="text-slate-300 mb-8 max-w-md mx-auto text-lg font-light">
                  Start your ETL pipeline journey by uploading a CSV file. We'll analyze, transform, and store your data.
                </p>
                <label className="inline-block relative group">
                  <div className="absolute inset-0 bg-blue-500 rounded-xl blur opacity-30 group-hover:opacity-75 transition duration-200"></div>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <span className="relative bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-4 rounded-xl cursor-pointer hover:from-blue-500 hover:to-indigo-500 transition-all inline-flex items-center gap-3 font-semibold shadow-lg hover:shadow-xl transform group-hover:scale-105 border border-white/20">
                    <Upload className="w-5 h-5" />
                    Choose CSV File
                  </span>
                </label>
                {uploadError && (
                  <div className="mt-8 bg-red-500/10 border border-red-500/30 text-red-200 px-6 py-4 rounded-xl max-w-md mx-auto backdrop-blur-md">
                    {uploadError}
                  </div>
                )}
              </div>
            )}

            {/* Raw Data Tab */}
            {activeTab === 'raw' && rawData && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-white tracking-tight">Raw Dataset</h2>
                  <button
                    onClick={() => downloadData(rawData, 'raw_data.csv')}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 hover:border-slate-500 px-6 py-3 rounded-xl font-semibold shadow-lg transition-all"
                  >
                    <Download className="w-5 h-5" />
                    Download CSV
                  </button>
                </div>
                {renderDataTable(rawData, `Total Rows: ${rawData.rows.length} | Columns: ${rawData.headers.length}`)}
              </div>
            )}

            {/* Quality Check Tab */}
            {activeTab === 'quality' && qualityReport && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-white tracking-tight">Data Quality Report</h2>
                  <div className="flex items-center gap-3 glass-card border border-green-500/30 bg-green-500/10 text-white px-6 py-3 rounded-xl shadow-[0_0_15px_rgba(34,197,94,0.2)]">
                    <Activity className="w-6 h-6 text-green-400" />
                    <div>
                      <p className="text-sm text-green-200">Quality Score</p>
                      <p className="text-2xl font-bold bg-gradient-to-r from-green-200 to-white bg-clip-text text-transparent">{qualityReport.qualityScore}%</p>
                    </div>
                  </div>
                </div>

                {/* Issues */}
                {qualityReport.issues.length > 0 && (
                  <div className="glass-card border-l-4 border-l-orange-500 border-y border-r border-orange-500/30 bg-orange-500/10 p-6 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-6 h-6 text-orange-400 mt-1" />
                      <div className="flex-1">
                        <h3 className="font-bold text-orange-200 mb-3">Data Quality Issues Found</h3>
                        <div className="space-y-2">
                          {qualityReport.issues.map((issue, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-sm">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${issue.severity === 'high' ? 'bg-red-500/20 text-red-200 border border-red-500/30' : 'bg-yellow-500/20 text-yellow-200 border border-yellow-500/30'
                                }`}>
                                {issue.severity.toUpperCase()}
                              </span>
                              <span className="text-slate-300">
                                <strong className="text-white">{issue.column}:</strong> {issue.message}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Column Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {Object.entries(qualityReport.columns).map(([colName, colData]) => (
                    <div key={colName} className="glass-card rounded-xl p-6 shadow-lg hover:shadow-xl transition-all border border-white/10 hover:border-white/20">
                      <div className="flex items-start justify-between mb-4">
                        <h3 className="font-bold text-white text-lg">{colName}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${colData.dataType === 'numeric' ? 'bg-blue-500/20 text-blue-200 border border-blue-500/30' : 'bg-purple-500/20 text-purple-200 border border-purple-500/30'
                          }`}>
                          {colData.dataType}
                        </span>
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-400">Completeness</span>
                          <div className="flex items-center gap-2">
                            <div className="w-32 h-2 bg-slate-700/50 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)] rounded-full"
                                style={{ width: `${colData.completeness}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-semibold text-emerald-300">{colData.completeness}%</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                            <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Null Count</p>
                            <p className="font-semibold text-white text-lg">{colData.nullCount}</p>
                          </div>
                          <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                            <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Unique Values</p>
                            <p className="font-semibold text-white text-lg">{colData.uniqueCount}</p>
                          </div>
                        </div>

                        {colData.dataType === 'numeric' && (
                          <div className="grid grid-cols-3 gap-2 text-sm pt-4 border-t border-white/10">
                            <div>
                              <p className="text-slate-400 text-xs">Min</p>
                              <p className="font-semibold text-white">{colData.min}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 text-xs">Max</p>
                              <p className="font-semibold text-white">{colData.max}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 text-xs">Avg</p>
                              <p className="font-semibold text-white">{colData.avg}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Visualize Tab */}
            {activeTab === 'visualize' && chartData && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-2xl font-bold text-white tracking-tight">Data Visualization</h2>

                {/* Line Chart */}
                {chartData.lineData.length > 0 && (
                  <div className="glass-card rounded-xl p-6 shadow-lg border border-white/10">
                    <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-2">
                      <div className="p-2 bg-blue-500/20 rounded-lg">
                        <TrendingUp className="w-5 h-5 text-blue-400" />
                      </div>
                      Numeric Trends
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={chartData.lineData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="index" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                        <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
                            backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '12px',
                            color: '#fff',
                            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)'
                          }}
                          itemStyle={{ color: '#fff' }}
                        />
                        <Legend wrapperStyle={{ color: '#fff' }} />
                        {chartData.numericColumns.map((col, idx) => (
                          <Line
                            key={col}
                            type="monotone"
                            dataKey={col}
                            stroke={COLORS[idx % COLORS.length]}
                            strokeWidth={3}
                            dot={{ r: 4, strokeWidth: 2, fill: '#0f172a' }}
                            activeDot={{ r: 6, strokeWidth: 0 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Bar Chart */}
                {chartData.lineData.length > 0 && (
                  <div className="glass-card rounded-xl p-6 shadow-lg border border-white/10">
                    <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-2">
                      <div className="p-2 bg-green-500/20 rounded-lg">
                        <BarChart3 className="w-5 h-5 text-green-400" />
                      </div>
                      Data Distribution
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={chartData.lineData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="index" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                        <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
                            backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '12px',
                            color: '#fff',
                            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)'
                          }}
                          itemStyle={{ color: '#fff' }}
                          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                        />
                        <Legend wrapperStyle={{ color: '#fff' }} />
                        {chartData.numericColumns.map((col, idx) => (
                          <Bar
                            key={col}
                            dataKey={col}
                            fill={COLORS[idx % COLORS.length]}
                            radius={[6, 6, 0, 0]}
                            fillOpacity={0.8}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Pie Chart for Null Distribution */}
                {chartData.nullData.length > 0 && (
                  <div className="glass-card rounded-xl p-6 shadow-lg border border-white/10">
                    <h3 className="text-lg font-semibold mb-6 text-white flex items-center gap-2">
                      <div className="p-2 bg-purple-500/20 rounded-lg">
                        <PieChart className="w-5 h-5 text-purple-400" />
                      </div>
                      Null Values Distribution by Column
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <RePieChart>
                        <Pie
                          data={chartData.nullData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          outerRadius={100}
                          innerRadius={60}
                          stroke="rgba(255,255,255,0.1)"
                          dataKey="value"
                        >
                          {chartData.nullData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
                            backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '12px',
                            color: '#fff',
                            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)'
                          }}
                          itemStyle={{ color: '#fff' }}
                        />
                      </RePieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* Transform Tab */}
            {activeTab === 'transform' && rawData && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h2 className="text-2xl font-bold text-white tracking-tight mb-6">Configure Transformations</h2>

                {/* Basic Operations */}
                <div className="glass-card border border-blue-500/30 bg-blue-500/10 rounded-xl p-6 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                  <h3 className="font-bold text-blue-200 mb-4 text-lg">Basic Operations</h3>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={transformConfig.removeNulls}
                        onChange={(e) => setTransformConfig(prev => ({
                          ...prev,
                          removeNulls: e.target.checked
                        }))}
                        className="w-5 h-5 text-blue-500 rounded focus:ring-2 focus:ring-blue-500 bg-black/40 border-white/20"
                      />
                      <div className="flex-1">
                        <span className="font-semibold text-white group-hover:text-blue-200 transition-colors">Remove rows with null values</span>
                        <p className="text-sm text-slate-400">Filter out rows containing empty or null fields</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={transformConfig.removeDuplicates}
                        onChange={(e) => setTransformConfig(prev => ({
                          ...prev,
                          removeDuplicates: e.target.checked
                        }))}
                        className="w-5 h-5 text-blue-500 rounded focus:ring-2 focus:ring-blue-500 bg-black/40 border-white/20"
                      />
                      <div className="flex-1">
                        <span className="font-semibold text-white group-hover:text-blue-200 transition-colors">Remove duplicate rows</span>
                        <p className="text-sm text-slate-400">Keep only unique rows in the dataset</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Fill Null Values */}
                <div className="glass-card border border-white/10 rounded-xl p-6 shadow-lg">
                  <h4 className="font-bold text-white mb-4 flex items-center gap-2 text-lg">
                    <AlertCircle className="w-5 h-5 text-orange-400" />
                    Fill Null Values Strategy
                  </h4>
                  <div className="space-y-3">
                    {rawData.headers.map(header => (
                      <div key={header} className="flex items-center gap-4 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors border border-white/5">
                        <span className="w-1/3 text-sm font-medium text-slate-200">{header}</span>
                        <select
                          onChange={(e) => setFillNullStrategy(header, e.target.value)}
                          className="flex-1 px-4 py-2 border border-white/20 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-800 text-white"
                        >
                          <option value="">Don't fill</option>
                          <option value="mean">Fill with Mean (numeric)</option>
                          <option value="median">Fill with Median (numeric)</option>
                          <option value="mode">Fill with Mode (most frequent)</option>
                          <option value="zero">Fill with Zero</option>
                          <option value="custom:N/A">Fill with "N/A"</option>
                          <option value="custom:Unknown">Fill with "Unknown"</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Filter Rows */}
                <div className="glass-card border border-white/10 rounded-xl p-6 shadow-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-white flex items-center gap-2 text-lg">
                      <Activity className="w-5 h-5 text-purple-400" />
                      Filter Rows (Conditions)
                    </h4>
                    <button
                      onClick={addFilterCondition}
                      className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-lg hover:shadow-purple-500/30"
                    >
                      + Add Filter
                    </button>
                  </div>
                  {transformConfig.filterConditions.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">No filters added. Click "Add Filter" to create conditions.</p>
                  ) : (
                    <div className="space-y-3">
                      {transformConfig.filterConditions.map((filter, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                          <select
                            value={filter.column}
                            onChange={(e) => updateFilterCondition(idx, 'column', e.target.value)}
                            className="flex-1 px-3 py-2 border border-white/20 rounded-lg text-sm bg-slate-800 text-white"
                          >
                            <option value="">Select Column</option>
                            {rawData.headers.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                          <select
                            value={filter.operator}
                            onChange={(e) => updateFilterCondition(idx, 'operator', e.target.value)}
                            className="px-3 py-2 border border-white/20 rounded-lg text-sm bg-slate-800 text-white"
                          >
                            <option value="">Operator</option>
                            <option value="equals">Equals (=)</option>
                            <option value="not_equals">Not Equals (≠)</option>
                            <option value="greater_than">Greater Than (&gt;)</option>
                            <option value="less_than">Less Than (&lt;)</option>
                            <option value="greater_equal">Greater or Equal (≥)</option>
                            <option value="less_equal">Less or Equal (≤)</option>
                            <option value="contains">Contains</option>
                          </select>
                          <input
                            type="text"
                            value={filter.value}
                            onChange={(e) => updateFilterCondition(idx, 'value', e.target.value)}
                            placeholder="Value"
                            className="flex-1 px-3 py-2 border border-white/20 rounded-lg text-sm bg-slate-800 text-white placeholder-slate-500"
                          />
                          <button
                            onClick={() => removeFilterCondition(idx)}
                            className="bg-red-500/20 text-red-300 hover:bg-red-500/40 border border-red-500/30 px-3 py-2 rounded-lg transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Select Columns to Keep */}
                <div className="glass-card border border-white/10 rounded-xl p-6 shadow-lg">
                  <h4 className="font-bold text-white mb-4 flex items-center gap-2 text-lg">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    Select Columns to Keep (Optional)
                  </h4>
                  <p className="text-sm text-slate-400 mb-4">Leave all unchecked to keep all columns</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {rawData.headers.map(header => (
                      <label key={header} className="flex items-center gap-2 p-3 bg-white/5 rounded-lg hover:bg-white/10 cursor-pointer transition-colors border border-white/5">
                        <input
                          type="checkbox"
                          checked={transformConfig.columnsToKeep.includes(header)}
                          onChange={() => toggleColumnSelection(header)}
                          className="w-4 h-4 text-emerald-500 rounded focus:ring-2 focus:ring-emerald-500 bg-black/40 border-white/20"
                        />
                        <span className="text-sm font-medium text-slate-200">{header}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Rename Columns */}
                <div className="glass-card border border-white/10 rounded-xl p-6 shadow-lg">
                  <h4 className="font-bold text-white mb-4 flex items-center gap-2 text-lg">
                    <Info className="w-5 h-5 text-blue-400" />
                    Rename Columns
                  </h4>
                  <div className="space-y-3">
                    {rawData.headers.map(header => (
                      <div key={header} className="flex items-center gap-4 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors border border-white/5">
                        <span className="w-1/3 text-sm font-medium text-slate-200">{header}</span>
                        <span className="text-slate-500">→</span>
                        <input
                          type="text"
                          placeholder="New name (optional)"
                          onChange={(e) => e.target.value && addColumnRename(header, e.target.value)}
                          className="flex-1 px-4 py-2 border border-white/20 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-800 text-white placeholder-slate-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Change Data Types & String Operations */}
                <div className="glass-card border border-white/10 rounded-xl p-6 shadow-lg">
                  <h4 className="font-bold text-white mb-4 flex items-center gap-2 text-lg">
                    <Activity className="w-5 h-5 text-emerald-400" />
                    Data Type Conversions & String Operations
                  </h4>
                  <div className="space-y-3">
                    {rawData.headers.map(header => (
                      <div key={header} className="flex items-center gap-4 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors border border-white/5">
                        <span className="w-1/3 text-sm font-medium text-slate-200">{header}</span>
                        <select
                          onChange={(e) => e.target.value && addDataTypeChange(header, e.target.value)}
                          className="flex-1 px-4 py-2 border border-white/20 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-800 text-white"
                        >
                          <option value="">Keep as string</option>
                          <option value="number">→ Convert to Number</option>
                          <option value="boolean">→ Convert to Boolean</option>
                          <option value="uppercase">→ Convert to UPPERCASE</option>
                          <option value="lowercase">→ Convert to lowercase</option>
                          <option value="trim">→ Trim whitespace</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Create Derived Columns */}
                <div className="glass-card border border-white/10 rounded-xl p-6 shadow-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-white flex items-center gap-2 text-lg">
                      <TrendingUp className="w-5 h-5 text-indigo-400" />
                      Create Derived Columns (Math Operations)
                    </h4>
                    <button
                      onClick={addDerivedColumn}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-lg hover:shadow-indigo-500/30"
                    >
                      + Add Column
                    </button>
                  </div>
                  {transformConfig.derivedColumns.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">No derived columns. Click "Add Column" to create calculated fields.</p>
                  ) : (
                    <div className="space-y-3">
                      {transformConfig.derivedColumns.map((derived, idx) => (
                        <div key={idx} className="p-4 bg-white/5 rounded-lg space-y-3 border border-white/5">
                          <div className="flex items-center gap-3">
                            <input
                              type="text"
                              value={derived.name}
                              onChange={(e) => updateDerivedColumn(idx, 'name', e.target.value)}
                              placeholder="New column name"
                              className="flex-1 px-3 py-2 border border-white/20 rounded-lg text-sm font-semibold bg-slate-800 text-white placeholder-slate-500"
                            />
                            <button
                              onClick={() => removeDerivedColumn(idx)}
                              className="bg-red-500/20 text-red-300 hover:bg-red-500/40 border border-red-500/30 px-3 py-2 rounded-lg transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              onChange={(e) => {
                                const currentFormula = derived.formula.split(' ');
                                updateDerivedColumn(idx, 'formula', `${e.target.value} ${currentFormula[1] || '+'} ${currentFormula[2] || ''}`);
                              }}
                              className="flex-1 px-3 py-2 border border-white/20 rounded-lg text-sm bg-slate-800 text-white"
                            >
                              <option value="">Column 1</option>
                              {rawData.headers.map(h => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                            <select
                              onChange={(e) => {
                                const currentFormula = derived.formula.split(' ');
                                updateDerivedColumn(idx, 'formula', `${currentFormula[0] || ''} ${e.target.value} ${currentFormula[2] || ''}`);
                              }}
                              className="px-3 py-2 border border-white/20 rounded-lg text-sm bg-slate-800 text-white"
                            >
                              <option value="+">+</option>
                              <option value="-">−</option>
                              <option value="*">×</option>
                              <option value="/">÷</option>
                            </select>
                            <select
                              onChange={(e) => {
                                const currentFormula = derived.formula.split(' ');
                                updateDerivedColumn(idx, 'formula', `${currentFormula[0] || ''} ${currentFormula[1] || '+'} ${e.target.value}`);
                              }}
                              className="flex-1 px-3 py-2 border border-white/20 rounded-lg text-sm bg-slate-800 text-white"
                            >
                              <option value="">Column 2</option>
                              {rawData.headers.map(h => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>
                          {derived.formula && (
                            <p className="text-xs text-slate-300 bg-black/20 px-3 py-2 rounded border border-white/10">
                              Formula: <span className="font-mono font-semibold text-blue-300">{derived.name} = {derived.formula}</span>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sort Data */}
                <div className="glass-card border border-white/10 rounded-xl p-6 shadow-lg">
                  <h4 className="font-bold text-white mb-4 flex items-center gap-2 text-lg">
                    <BarChart3 className="w-5 h-5 text-pink-400" />
                    Sort Data
                  </h4>
                  <div className="flex items-center gap-4">
                    <select
                      value={transformConfig.sortColumn}
                      onChange={(e) => setTransformConfig(prev => ({
                        ...prev,
                        sortColumn: e.target.value
                      }))}
                      className="flex-1 px-4 py-2 border border-white/20 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-slate-800 text-white"
                    >
                      <option value="">Select column to sort by</option>
                      {rawData.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    <select
                      value={transformConfig.sortOrder}
                      onChange={(e) => setTransformConfig(prev => ({
                        ...prev,
                        sortOrder: e.target.value
                      }))}
                      className="px-4 py-2 border border-white/20 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-slate-800 text-white"
                    >
                      <option value="asc">Ascending ↑</option>
                      <option value="desc">Descending ↓</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={applyTransformations}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-emerald-500/40 transform hover:scale-[1.02] transition-all flex items-center justify-center gap-3 border border-white/20"
                >
                  <CheckCircle className="w-6 h-6" />
                  Apply All Transformations
                </button>
              </div>
            )}

            {/* Transformed Data Tab */}
            {activeTab === 'transformed' && transformedData && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-white tracking-tight">Transformed Dataset</h2>
                  <div className="flex gap-3">
                    <button
                      onClick={() => downloadData(transformedData, 'transformed_data.csv')}
                      className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 hover:border-slate-500 px-6 py-3 rounded-xl font-semibold shadow-lg transition-all"
                    >
                      <Download className="w-5 h-5" />
                      Download
                    </button>
                    <button
                      onClick={storeToDatabase}
                      className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-3 rounded-xl hover:from-purple-700 hover:to-purple-800 font-semibold shadow-lg shadow-purple-500/20"
                    >
                      <Database className="w-5 h-5" />
                      Store to Database
                    </button>
                  </div>
                </div>
                {renderDataTable(transformedData, `Total Rows: ${transformedData.rows.length} | Columns: ${transformedData.headers.length}`)}
              </div>
            )}

            {/* Stored Data Tab */}
            {activeTab === 'stored' && storedData && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="glass-card border border-green-500/30 bg-green-500/10 rounded-xl p-6 mb-8 shadow-[0_0_25px_rgba(34,197,94,0.15)]">
                  <div className="flex items-start gap-4">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-green-500/20 rounded-xl">
                      <CheckCircle className="w-7 h-7 text-green-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-green-300 text-xl mb-3">Data Successfully Stored!</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-black/30 rounded-lg p-3 border border-white/10">
                          <p className="text-sm text-green-200/70 mb-1">Table Name</p>
                          <p className="font-mono font-semibold text-green-300">{storedData.tableName}</p>
                        </div>
                        <div className="bg-black/30 rounded-lg p-3 border border-white/10">
                          <p className="text-sm text-green-200/70 mb-1">Database</p>
                          <p className="font-mono font-semibold text-green-300">{storedData.database}</p>
                        </div>
                        <div className="bg-black/30 rounded-lg p-3 border border-white/10">
                          <p className="text-sm text-green-200/70 mb-1">Timestamp</p>
                          <p className="font-mono font-semibold text-green-300">
                            {new Date(storedData.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {renderDataTable(storedData, `Stored Rows: ${storedData.rows.length} | Columns: ${storedData.headers.length}`)}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-slate-500 text-sm mt-8 pb-8">
          <p>ETL Pipeline Dashboard - Built with React & Recharts</p>
          <p className="mt-1 opacity-70">Upload CSV • Transform Data • Visualize Results • Store to Database</p>
        </div>
      </div>
    </div>
  );
};

export default ETLPipelineDashboard;