const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const verifierToken = require('../middlewares/authMiddleware');

// 1. Import et initialisation de Gemini
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// middleware de protection
router.use(verifierToken);

// --- NOUVELLE ROUTE IA : ANALYSE VOCALE ---
// Il est important de la mettre AVANT la route POST '/' pour éviter les conflits
// --- NOUVELLE ROUTE IA : ANALYSE VOCALE ---
router.post('/analyze-voice', async (req, res) => {
  try {
    const { texte, categoriesDisponibles } = req.body;

    const prompt = `
    Tu es un assistant financier d'une application de gestion de budget. 
    L'utilisateur a dicté ceci vocalement : "${texte}".
    Extrais les informations pour préparer une transaction.
    
    Voici la liste des catégories disponibles avec leurs IDs (choisis le bon 'categorieId') :
    ${JSON.stringify(categoriesDisponibles)}

    Règles strictes :
    - 'type' doit être "depense" ou "revenu". (Si on parle d'achat, c'est une depense. Si on parle de salaire, c'est un revenu).
    - 'montant' doit être un nombre exact supérieur à 0. S'il n'y a pas de montant clair dans la phrase, mets 1 par défaut.
    - 'titre' doit être un résumé court (ex: "Déjeuner restaurant", "Plein d'essence").
    - 'date' doit être au format YYYY-MM-DD. Aujourd'hui, nous sommes le ${new Date().toISOString().split('T')[0]}.
    `;

    // 💡 LA CORRECTION EST ICI : On utilise la toute dernière version de Gemini
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash", 
        generationConfig: {
            responseMimeType: "application/json", 
        }
    });

    const result = await model.generateContent(prompt);
    let responseText = result.response.text();
    
    // Nettoyage de sécurité au cas où l'IA ajoute des balises Markdown
    responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const data = JSON.parse(responseText);

    res.status(200).json(data);
  } catch (err) {
    console.error("Erreur Gemini:", err);
    res.status(500).json({ message: "Erreur d'analyse IA", detail: err.message });
  }
});
// --- NOUVELLE ROUTE IA : ANALYSE TICKET DE CAISSE (VISION) ---
router.post('/scan-receipt', async (req, res) => {
  try {
    const { imageBase64, categoriesDisponibles } = req.body;

    const prompt = `
    Tu es un assistant financier d'une application de gestion de budget. 
    Analyse ce ticket de caisse.
    
    Voici la liste des catégories disponibles avec leurs IDs (choisis le bon 'categorieId') :
    ${JSON.stringify(categoriesDisponibles)}

    Règles strictes :
    - 'type' doit être "depense".
    - 'montant' doit être le montant total à payer extrait du ticket (un nombre exact, sans devise, utilise un point pour les décimales).
    - 'titre' doit être le nom du magasin ou un résumé très court du ticket (ex: "Bim", "Café").
    - 'date' doit être au format YYYY-MM-DD. Si tu vois une date sur le ticket mets-la, sinon utilise ${new Date().toISOString().split('T')[0]}.
    `;

    // Utilisation de Gemini 2.5 Flash qui lit parfaitement les images
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash", 
        generationConfig: {
            responseMimeType: "application/json", 
        }
    });

    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: "image/jpeg" 
      }
    };

    const result = await model.generateContent([prompt, imagePart]);
    let responseText = result.response.text();
    
    // Nettoyage de sécurité
    responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(responseText);

    res.status(200).json(data);
  } catch (err) {
    console.error("Erreur Gemini Vision:", err);
    res.status(500).json({ message: "Erreur de lecture du ticket", detail: err.message });
  }
});
// --- ROUTES CLASSIQUES ---

// creer une transaction
router.post('/', async (req, res) => {
  try {
    const { titre, montant, type, categorieId, description, date } = req.body;

    const nouvelleTransaction = new Transaction({
      titre, montant, type, description,
      categorie: categorieId,
      date: date || Date.now(), 
      utilisateur: req.utilisateur.id 
    });

    const transactionSauvegardee = await nouvelleTransaction.save();
    res.status(201).json(transactionSauvegardee);
  } catch (err) {
    res.status(400).json({ message: "Erreur de création", detail: err.message });
  }
});

// lister les transactions de l'utilisateur
router.get('/', async (req, res) => {
    try {
        const transactions = await Transaction.find({ utilisateur: req.utilisateur.id })
            .populate('categorie', 'nom couleur icone') 
            .sort({ date: -1 }); 
        
        res.status(200).json(transactions);
    } catch (err) {
        res.status(500).json({ message: "Erreur serveur", detail: err.message });
    }
});

// modifier une transaction
router.put('/:id', async (req, res) => {
    try {
        const { titre, montant, type, categorieId, description, date } = req.body;

        const transactionMiseAJour = await Transaction.findOneAndUpdate(
            { _id: req.params.id, utilisateur: req.utilisateur.id }, 
            { titre, montant, type, categorie: categorieId, description, date }, 
            { new: true, runValidators: true } 
        );

        if (!transactionMiseAJour) return res.status(404).json({ message: "Transaction introuvable." });
        res.status(200).json(transactionMiseAJour);
    } catch (err) {
        res.status(400).json({ message: "Erreur de modification", detail: err.message });
    }
});

// supprimer une transaction
router.delete('/:id', async (req, res) => {
    try {
        const transactionSupprimee = await Transaction.findOneAndDelete({ 
            _id: req.params.id, 
            utilisateur: req.utilisateur.id 
        });

        if (!transactionSupprimee) return res.status(404).json({ message: "Transaction introuvable." });
        res.status(200).json({ message: "Transaction supprimée avec succès." });
    } catch (err) {
        res.status(500).json({ message: "Erreur serveur", detail: err.message });
    }
});

module.exports = router;