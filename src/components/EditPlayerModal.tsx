import React, { useState, useEffect } from 'react';
import { Player, Category, DivisionType } from '../types';
import { X, User as UserIcon, RefreshCw, Check, Award, AlertCircle } from 'lucide-react';

interface EditPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: Player | null;
  categories: Category[];
  onSave: (id: string, updatedData: Partial<Player>) => Promise<void>;
}

export default function EditPlayerModal({ isOpen, onClose, player, categories, onSave }: EditPlayerModalProps) {
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [categoria, setCategoria] = useState('');
  const [division, setDivision] = useState<DivisionType>('Masculina');
  const [puntos, setPuntos] = useState(1000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (player) {
      setNombre(player.nombre || '');
      setApellidos(player.apellidos || '');
      setCategoria(player.categoria || (categories[0]?.name || 'Primera'));
      setDivision(player.division || 'Masculina');
      setPuntos(player.puntos ?? 1000);
      setError(null);
      setSuccess(false);
    }
  }, [player, categories, isOpen]);

  if (!isOpen || !player) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    if (!nombre.trim() || !apellidos.trim()) {
      setError("Por favor, rellena el nombre y los apellidos.");
      setLoading(false);
      return;
    }

    try {
      const updateData: Partial<Player> = {
        nombre: nombre.trim(),
        apellidos: apellidos.trim(),
        categoria,
        division,
        puntos: Number(puntos),
        updatedAt: new Date().toISOString()
      };

      await onSave(player.id, updateData);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err: any) {
      console.error("Error updating player in modal:", err);
      setError("Ocurrió un error al guardar los cambios: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-md glass-card border border-[var(--border-subtle)] rounded-2xl shadow-2xl p-6 overflow-hidden text-ink z-10 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Glow Line */}
        <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-ball/40 to-transparent" />

        {/* Header */}
        <div className="flex justify-between items-center mb-6 border-b border-[var(--border-subtle)] pb-4">
          <div>
            <h3 className="font-display text-lg font-black uppercase tracking-tight text-ink flex items-center gap-2">
              <UserIcon className="h-5 w-5 text-ball-safe" />
              <span>Modificar Ficha de Jugador</span>
            </h3>
            <p className="text-ink-faint text-[11px] font-sans mt-0.5">Editando información de {player.nombre} {player.apellidos}.</p>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1 text-ink-muted hover:text-ink rounded-lg hover:bg-[var(--surface-2)] transition-all text-sm cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 p-3 rounded-xl text-xs flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-emerald-400 font-bold" />
              <span>¡Jugador actualizado correctamente!</span>
            </div>
          )}

          {/* Nome e Apellidos */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1 font-mono">Nombre</label>
              <input 
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full bg-[var(--surface-input)] hover:bg-[var(--surface-input)] focus:bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-ball/50 transition-all font-sans"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1 font-mono">Apellidos</label>
              <input 
                type="text"
                required
                value={apellidos}
                onChange={(e) => setApellidos(e.target.value)}
                className="w-full bg-[var(--surface-input)] hover:bg-[var(--surface-input)] focus:bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-ball/50 transition-all font-sans"
              />
            </div>
          </div>

          {/* Nivel / Categoria */}
          <div>
            <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1 font-mono">Categoría / Nivel</label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink text-sm py-2 px-3 rounded-xl focus:outline-none focus:border-ball/50 transition-all cursor-pointer"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name} className="bg-slate-900 text-ink">
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Division / Sexo */}
          <div>
            <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1 font-mono">División / Sexo</label>
            <select
              value={division}
              onChange={(e) => setDivision(e.target.value as DivisionType)}
              className="w-full bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink text-sm py-2 px-3 rounded-xl focus:outline-none focus:border-ball/50 transition-all cursor-pointer"
            >
              <option value="Masculina" className="bg-slate-900 text-ink">Masculina</option>
              <option value="Femenina" className="bg-slate-900 text-ink">Femenina</option>
            </select>
          </div>

          {/* Puntos de Clasificacion */}
          <div>
            <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-widest mb-1 font-mono">Puntos</label>
            <input 
              type="number"
              min="0"
              required
              value={puntos}
              onChange={(e) => setPuntos(parseInt(e.target.value) || 0)}
              className="w-full bg-[var(--surface-input)] hover:bg-[var(--surface-input)] focus:bg-[var(--surface-input)] border border-[var(--border-subtle)] text-ink rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-ball/50 transition-all font-mono text-accent font-bold"
            />
          </div>

          {/* Form Actions */}
          <div className="flex gap-2 pt-4 border-t border-[var(--border-subtle)]">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-ink font-bold text-xs rounded-xl transition-all cursor-pointer"
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-ball hover:bg-ball-hover text-black font-black uppercase tracking-widest text-[11px] py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-lime-950/20 cursor-pointer"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin text-black" />
              ) : (
                <Check className="h-4 w-4 text-black font-bold" />
              )}
              <span>Guardar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
