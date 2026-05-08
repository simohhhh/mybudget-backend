const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const verifierToken = require('../middlewares/authMiddleware');

// middleware de protection
router.use(verifierToken);

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