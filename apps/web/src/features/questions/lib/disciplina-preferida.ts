/**
 * Guarda a última disciplina que o professor abriu (revisão ou exportação),
 * pra não cair sempre na primeira da lista ao voltar. É só uma conveniência
 * por navegador — em modo privado / storage bloqueado, degrada em silêncio.
 */
const CHAVE = "questum:ultima-disciplina";

export function lerDisciplinaPreferida(): string | null {
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

export function salvarDisciplinaPreferida(id: string): void {
  try {
    localStorage.setItem(CHAVE, id);
  } catch {
    // storage indisponível — segue sem persistir
  }
}

/** Id salvo se ainda existir na lista atual; senão o primeiro da lista. */
export function escolherDisciplinaInicial<T extends { id: string }>(
  disciplinas: T[],
): T | undefined {
  if (disciplinas.length === 0) return undefined;
  const salva = lerDisciplinaPreferida();
  return disciplinas.find((d) => d.id === salva) ?? disciplinas[0];
}
