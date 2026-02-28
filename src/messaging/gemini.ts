export async function queryGemini(conversationContext: string, userQuery: string): Promise<string> {
  try {
    const rawKey = process.env.GEMINI_API_KEY || "";
    const apiKey = rawKey.replace(/[\r\n\s"']/g, '');

    if (!apiKey) {
      return "❌ Erreur : Clé GEMINI_API_KEY introuvable. Mode hors-ligne strict activé.";
    }

    // CORRECTION FINALE : On pointe vers le modèle 2.0 actif en 2026 !
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent");
    url.searchParams.append("key", apiKey);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { 
            role: 'user', 
            parts: [{ text: `Contexte du réseau Archipel:\n${conversationContext}\n\nQuestion: ${userQuery}` }] 
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur ${response.status} : ${errorText}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
    
  } catch (error: any) {
    return `❌ Impossible de joindre l'IA : ${error.message}. Le réseau Archipel repasse en mode hors-ligne.`;
  }
}