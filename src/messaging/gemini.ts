export async function queryGemini(conversationContext: string, userQuery: string): Promise<string> {
  try {
    // 1. Récupération de la clé brute
    const rawKey = process.env.GEMINI_API_KEY || "";
    
    // 2. Nettoyage ultra-agressif (retire les espaces, guillemets, apostrophes et retours à la ligne)
    const apiKey = rawKey.replace(/[\r\n\s"']/g, '');

    if (!apiKey) {
      return "❌ Erreur : Clé GEMINI_API_KEY introuvable ou vide. Mode hors-ligne strict activé.";
    }

    // 3. Construction sécurisée de l'URL (impossible d'avoir une 404 liée à la syntaxe)
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent");
    url.searchParams.append("key", apiKey);

    // 4. Appel à l'API
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

    // 5. Gestion détaillée des erreurs pour comprendre ce qui bloque
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