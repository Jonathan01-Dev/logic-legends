export async function queryGemini(conversationContext: string, userQuery: string): Promise<string> {
  // Le .trim() est vital sur Windows pour retirer les retours à la ligne invisibles (\r)
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  
  if (!apiKey) {
    return "❌ Erreur : Clé GEMINI_API_KEY introuvable dans l'environnement. Mode hors-ligne strict activé.";
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { 
              role: 'user', 
              parts: [{ text: `Contexte du réseau P2P Archipel:\n${conversationContext}\n\nRequête de l'utilisateur: ${userQuery}` }] 
            }
          ]
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Erreur HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error: any) {
    return `❌ Impossible de joindre les serveurs IA (${error.message}). Le réseau Archipel repasse en mode 100% hors-ligne.`;
  }
}