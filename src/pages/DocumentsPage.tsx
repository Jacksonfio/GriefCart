import { useEffect, useState, useRef } from 'react';
import { getDocuments, uploadDocument, getDocument } from '@/services/griefcart-client';
import { FileText, Upload, ExternalLink, Clock, Shield } from 'lucide-react';
import { formatBytes, timeAgo } from '@/lib/utils';
import { PageTitle } from '@/components/layout/PageTitle';
import type { Document } from '@/types';

const categories = ['bank', 'insurance', 'investment', 'loan', 'legal', 'property', 'tax', 'medical', 'education', 'other'];

export function DocumentsPage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState('bank');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try { const res = await getDocuments(); setDocs(res.documents); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { await uploadDocument(file, category); await load(); } catch (err) { alert('Upload failed: ' + (err as Error).message); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <PageTitle title="Document Vault" subtitle="Your encrypted financial document storage" accent="red" />
        <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
          <Shield className="h-3 w-3 text-purple-400" /> AES-256 / KMS
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="sr-only" htmlFor="document-category">Document category</label>
            <select id="document-category" aria-label="Document category" value={category} onChange={e => setCategory(e.target.value)}
              className="w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs text-text outline-none focus:border-orange/50 mb-2">
              {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="btn-primary inline-flex items-center gap-2 text-xs justify-center rounded-md px-4 py-2 font-semibold shadow transition-all hover:brightness-110 disabled:opacity-50">
            <Upload className="h-3.5 w-3.5" /> {uploading ? 'Uploading...' : 'Upload'}
          </button>
          <label className="sr-only" htmlFor="document-upload">Upload document</label>
          <input id="document-upload" ref={fileRef} type="file" onChange={handleUpload} accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx" className="hidden" aria-label="Upload document" />
        </div>
        <p className="mt-2 text-[10px] text-text-muted">PDF, PNG, JPEG — 50MB max — Encrypted with KMS</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-orange border-t-transparent" /></div>
      ) : docs.length === 0 ? (
        <div className="card p-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-text-muted" />
          <p className="mt-3 text-xs text-text-secondary">No documents yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.documentId} className="card p-4 flex items-center gap-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-red shrink-0">
                <FileText className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text truncate">{doc.fileName}</p>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-text-secondary">
                  <span>{formatBytes(doc.size)}</span>
                  <span className="px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">{doc.category}</span>
                  <span><Clock className="h-2.5 w-2.5 inline" /> {timeAgo(doc.uploadedAt)}</span>
                </div>
              </div>
              <button type="button" aria-label={`Open ${doc.fileName}`} onClick={async () => { try { const d = await getDocument(doc.documentId); if (d.presignedUrl) window.open(d.presignedUrl, '_blank'); } catch { alert('Could not open document'); } }} className="p-2 rounded-md text-text-muted hover:text-purple-400 transition-colors">
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
