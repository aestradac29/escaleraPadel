import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Player, Category, DivisionType } from '../types';
import { X, User as UserIcon, RefreshCw, Check, Award, Shield, AlertCircle } from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Player | null;
  categories: Category[];
  isAdmin: boolean;
}

export default function ProfileModal({ isOpen, onClose, profile, categories, isAdmin }: ProfileModalProps) {
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [telefono, setTelefono] = useState('');
  const [categoria, setCategoria] = useState('');
  const [division, setDivision] = useState<DivisionType>('Masculina');
  const [puntos, setPuntos] = useState(1000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (profile) {
      setNombre(profile.nombre || '');
      setApellidos(profile.apellidos || '');
      setTelefono(profile.telefono || '');
      setCategoria(profile.categoria || (categories[0]?.name || 'Primera'));
      setDivision(profile.division || 'Masculina');
      setPuntos(profile.puntos ?? 1000);
      setError(null);
      setSuccess(false);
    }
  }, [profile, categories, isOpen]);

  if (!isOpen || !profile) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    if (!nombre.trim() || !apellidos.trim()) {
      setError("Por favor, rellena tu nombre y apellidos.");
      setLoading(false);
      return;
    }

    const telefonoLimpio = telefono.replace(/\D/g, '');
    if (telefonoLimpio && (telefonoLimpio.length < 9 || telefonoLimpio.length > 15)) {
      setError("Introduce un número de teléfono válido (ej: 612 345 678).");
      setLoading(false);
      return;
    }

    try {
      const docRef = doc(db, 'players', profile.id);

      const updateData: Partial<Player> = {
        nombre: nombre.trim(),
        apellidos: apellidos.trim(),
        telefono: telefono.trim(),
        updatedAt: new Date().toISOString()
      };

      // Only let admins update categorization parameter values
      if (isAdmin) {
        updateData.categoria = categoria;
        updateData.division = division;
        updateData.puntos = puntos;
      }

      await updateDoc(docRef, updateData);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error("Error updating profile:", err);
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
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="font-display text-xl font-black uppercase tracking-tight text-ink flex items-center gap-2">
              <UserIcon className="h-5 w-5 text-ball-safe" />
              <span>Mi Perfil de Jugador</span>
            </h3>
            {profile.email && (
              <p className="text-xs text-ink-muted mt-0.5 font-mono">
                {profile.email}
              </p>
            )}
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-[var(--surface-2)] rounded-lg text-ink-muted hover:text-ink transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Info/Admin Banner */}
        {isAdmin && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs rounded-xl flex items-center space-x-2">
            <Shield className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>Tienes permisos de Administrador para editar todos los campos.</span>
          </div>
        )}

        {/* Message Banner */}
        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-xl flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="leading-normal">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-ball/20 text-ball-safe text-xs rounded-xl flex items-center space-x-2 font-bold uppercase tracking-wider">
            <Check className="h-4 w-4 text-ball-safe" />
            <span>¡Datos guardados con éxito!</span>
          </div>
        )}

        {/* Edit Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Nombre */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-ink-muted">Nombre</label>
            <input 
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-ball transition-colors"
              required
            />
          </div>

          {/* Apellidos */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-ink-muted">Apellidos</label>
            <input 
              type="text"
              value={apellidos}
              onChange={(e) => setApellidos(e.target.value)}
              className="w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-ball transition-colors"
              required
            />
          </div>

          {/* Teléfono — editable por cualquier jugador, no solo admins */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-ink-muted">Teléfono</label>
            <input 
              type="tel"
              placeholder="Ej: 612 345 678"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-ball transition-colors"
            />
            <p className="text-[10px] text-ink-faint leading-snug">
              Se usa para avisarte de retos y resultados por WhatsApp.
            </p>
          </div>

          {/* Admin-only classification fields */}
          {isAdmin ? (
            <div className="space-y-4 pt-2 border-t border-[var(--border-subtle)]">
              
              <div className="grid grid-cols-2 gap-3">
                {/* Categoría */}
                <div className="space-y-1.5">
                  <label className="text-xs font-mono uppercase tracking-wider text-ink-muted">Categoría</label>
                  <select
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-ball cursor-pointer"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.name} className="bg-slate-900 text-ink">
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* División */}
                <div className="space-y-1.5">
                  <label className="text-xs font-mono uppercase tracking-wider text-ink-muted">División</label>
                  <select
                    value={division}
                    onChange={(e) => setDivision(e.target.value as DivisionType)}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-ball cursor-pointer"
                  >
                    <option value="Masculina" className="bg-slate-900">Masculina</option>
                    <option value="Femenina" className="bg-slate-900">Femenina</option>
                  </select>
                </div>
              </div>

              {/* Puntos */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono uppercase tracking-wider text-ball-safe font-medium flex justify-between">
                  <span>Puntos de Clasificación</span>
                  <span className="text-[10px] text-ink-muted capitalize">Control Admin</span>
                </label>
                <input 
                  type="number"
                  value={puntos}
                  onChange={(e) => setPuntos(parseInt(e.target.value) || 0)}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-sm text-ink font-mono font-bold focus:outline-none focus:border-ball"
                  required
                />
              </div>

            </div>
          ) : (
            // Read-only parameters for nonadmin players
            <div className="grid grid-cols-3 gap-2.5 pt-4 border-t border-[var(--border-subtle)] text-center">
              <div className="bg-[var(--surface-2)] p-2 rounded-xl border border-[var(--border-subtle)]">
                <div className="text-[9px] uppercase tracking-wider text-ink-muted font-mono">Categoría</div>
                <div className="text-xs font-bold text-ink mt-1">{profile.categoria}</div>
              </div>
              <div className="bg-[var(--surface-2)] p-2 rounded-xl border border-[var(--border-subtle)]">
                <div className="text-[9px] uppercase tracking-wider text-ink-muted font-mono">División</div>
                <div className="text-xs font-bold text-ink mt-1">{profile.division}</div>
              </div>
              <div className="bg-[var(--surface-2)] p-2 rounded-xl border border-[var(--border-subtle)]">
                <div className="text-[9px] uppercase tracking-wider text-ball-safe/70 font-mono">Puntos</div>
                <div className="text-xs font-black text-ball-safe mt-1">{profile.puntos ?? 1000}</div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2.5 pt-4 border-t border-[var(--border-subtle)]">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-ball hover:bg-ball-hover disabled:bg-slate-700 disabled:text-ink-muted text-black text-xs font-black uppercase tracking-wider py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-2 shadow-lg shadow-lime-950/20"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin text-black" />
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <span>Guardar Cambios</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 bg-[var(--surface-2)] hover:bg-[var(--surface-2)] border border-[var(--border-subtle)] text-ink text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
            >
              Cerrar
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
