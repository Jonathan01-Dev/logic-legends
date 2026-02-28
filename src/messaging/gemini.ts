export async function queryGemini(conversationContext: string, userQuery: string): Promise<string> {
  // Récupération sécurisée de la clé depuis l'environnement
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return "❌ Erreur : Clé GEMINI_API_KEY introuvable dans l'environnement. Mode hors-ligne strict activé.";
  }

  try {
    // CORRECTION ICI : Utilisation du modèle gemini-1.5-flash (standard actuel) au lieu de gemini-pro
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
    // Le Fallback gracieux exigé par le hackathon
    return `❌ Impossible de joindre les serveurs IA (${error.message}). Le réseau Archipel repasse en mode 100% hors-ligne.`;
  }
}
// FIN DU FICHIER