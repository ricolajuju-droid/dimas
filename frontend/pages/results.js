import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

export default function Results() {
  const [docs, setDocs] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expediente, setExpediente] = useState('');

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('expediente_docs_result');
      const parsed = raw ? JSON.parse(raw) : {};

      const parsedDocs = Array.isArray(parsed.documents) ? parsed.documents : [];
      const parsedExpediente = parsed.expediente || '';

      setDocs(parsedDocs);
      setExpediente(parsedExpediente);
      setLoading(false);
    } catch {
      setError('No se pudieron recuperar los documentos de la búsqueda.');
      setLoading(false);
    }
  }, []);

  const downloadableDocs = useMemo(
    () => docs.filter((doc) => !!doc.url && !['visualizable', 'stamp'].includes(doc.type)),
    [docs]
  );

  const allSelected = useMemo(
    () => downloadableDocs.length > 0 && selected.length === downloadableDocs.length,
    [downloadableDocs, selected]
  );

  const toggle = (docId) => {
    setSelected((prev) =>
      prev.includes(docId)
        ? prev.filter((id) => id !== docId)
        : [...prev, docId]
    );
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected([]);
    } else {
      setSelected(downloadableDocs.map((doc) => doc.id));
    }
  };

  const selectedDocs = docs.filter((doc) => selected.includes(doc.id));

  const downloadOne = async (doc) => {
    if (!doc.url || ['visualizable', 'stamp'].includes(doc.type)) {
      alert('Este elemento no tiene descarga directa utilizable.');
      return;
    }

    try {
      const res = await axios.post(
        'http://localhost:4000/api/expedientes/download',
        { doc },
        { responseType: 'blob' }
      );

      const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = blobUrl;

      const cleanBaseName = (doc.baseName || doc.name || 'documento').replace(/[<>:"/\\|?*]+/g, '_').trim();
      const ext = (doc.type || 'bin').toLowerCase();
      a.download = ['pdf', 'xml', 'html', 'doc', 'docx', 'xls', 'xlsx', 'zip'].includes(ext)
        ? `${cleanBaseName}.${ext}`
        : cleanBaseName;

      a.click();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert(err?.response?.data?.error || 'No se pudo descargar el documento.');
    }
  };

  const downloadZip = async () => {
    if (!selectedDocs.length) {
      alert('Selecciona al menos un documento con descarga directa.');
      return;
    }

    try {
      const res = await axios.post(
        'http://localhost:4000/api/expedientes/download-zip',
        { docs: selectedDocs, expediente },
        { responseType: 'blob' }
      );

      const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = expediente ? `expediente_${expediente}.zip` : 'documentos.zip';
      a.click();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert(err?.response?.data?.error || 'No se pudo generar el ZIP.');
    }
  };

  const typeLabel = (type) => {
    if (!type || type === 'desconocido') return 'No identificado';
    if (type === 'visualizable') return 'Visualizable';
    if (type === 'stamp') return 'Sello de tiempo';
    return type.toUpperCase();
  };

  const statusLabel = (status) => {
    switch (status) {
      case 'detectado':
        return 'Disponible';
      case 'sin_enlace_directo':
        return 'Sin enlace directo';
      default:
        return status || 'Desconocido';
    }
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'Arial, sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      <button
        onClick={() => window.history.back()}
        style={{
          padding: '10px 14px',
          borderRadius: '8px',
          border: '1px solid #d0d7de',
          background: '#fff',
          cursor: 'pointer',
          marginBottom: '20px',
        }}
      >
        Atrás
      </button>

      <h1 style={{ marginBottom: '10px' }}>Documentos del expediente</h1>

      {expediente && (
        <div style={{ marginBottom: '16px', color: '#344054', fontWeight: 600 }}>
          Expediente: {expediente}
        </div>
      )}

      {loading && <p>Cargando documentos...</p>}
      {error && <p style={{ color: '#d1242f', fontWeight: 600 }}>{error}</p>}

      {!loading && !error && docs.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
            <button
              onClick={toggleAll}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #d0d7de',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              {allSelected ? 'Deseleccionar descargables' : 'Seleccionar descargables'}
            </button>

            <button
              onClick={downloadZip}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #0f62fe',
                background: '#0f62fe',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Descargar seleccionados
            </button>

            <div style={{ alignSelf: 'center', color: '#667085', fontSize: '14px' }}>
              {docs.length} elementos detectados · {downloadableDocs.length} descargables
            </div>
          </div>

          <div style={{ display: 'grid', gap: '14px' }}>
            {docs.map((doc) => {
              const canDownload = !!doc.url && !['visualizable', 'stamp'].includes(doc.type);

              return (
                <div
                  key={doc.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    padding: '16px',
                    background: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <input
                      type="checkbox"
                      checked={selected.includes(doc.id)}
                      disabled={!canDownload}
                      onChange={() => toggle(doc.id)}
                      style={{ marginTop: '4px' }}
                    />

                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', color: '#667085', marginBottom: '6px' }}>
                        {doc.section || 'Documentos'}
                        {doc.postDate ? ` · ${doc.postDate}` : ''}
                      </div>

                      <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
                        {doc.name}
                      </div>

                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        <span style={{
                          background: '#eef4ff',
                          color: '#1f4dbd',
                          padding: '4px 8px',
                          borderRadius: '999px',
                          fontSize: '13px',
                          fontWeight: 600,
                        }}>
                          Tipo: {typeLabel(doc.type)}
                        </span>

                        <span style={{
                          background: canDownload ? '#ecfdf3' : '#fff4e5',
                          color: canDownload ? '#027a48' : '#b54708',
                          padding: '4px 8px',
                          borderRadius: '999px',
                          fontSize: '13px',
                          fontWeight: 600,
                        }}>
                          Estado: {statusLabel(doc.status)}
                        </span>
                      </div>

                      {doc.url ? (
                        <div style={{ fontSize: '12px', color: '#667085', wordBreak: 'break-all' }}>
                          {doc.url}
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#b54708' }}>
                          No se ha encontrado enlace directo de descarga.
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => downloadOne(doc)}
                      disabled={!canDownload}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid #d0d7de',
                        background: canDownload ? '#fff' : '#f3f4f6',
                        color: canDownload ? '#111827' : '#9ca3af',
                        cursor: canDownload ? 'pointer' : 'not-allowed',
                        minWidth: '120px',
                      }}
                    >
                      {canDownload ? 'Descargar' : 'No disponible'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!loading && !error && docs.length === 0 && (
        <p>No se encontraron documentos.</p>
      )}
    </div>
  );
}