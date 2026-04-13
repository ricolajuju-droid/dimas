import { useState } from 'react';
import axios from 'axios';

export default function Home() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) {
      setError('Introduce un número de expediente o una URL.');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const res = await axios.post('http://localhost:4000/api/expedientes/search', {
        query: query.trim(),
      });

      sessionStorage.setItem(
        'expediente_docs_result',
        JSON.stringify({
          expediente: res.data.expediente || '',
          documents: res.data.documents || [],
        })
      );

      window.location.href = '/results';
    } catch (err) {
      const message =
        err?.response?.data?.error || 'No se pudo buscar el expediente.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Buscador de Expedientes</h1>

      <div style={{ display: 'flex', gap: '8px', maxWidth: '700px' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Número de expediente o URL"
          style={{ flex: 1, padding: '10px' }}
        />
        <button onClick={handleSearch} disabled={loading}>
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {error && (
        <p style={{ color: 'crimson', marginTop: '12px' }}>
          {error}
        </p>
      )}
    </div>
  );
}