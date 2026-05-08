const express = require('express');
const router = express.Router();
const Categorie = require('../models/Categorie');
const verifierToken = require('../middlewares/authMiddleware');

// middleware de protection
router.use(verifierToken);

// ajouter une categorie
router.post('/', async (req, res) => {
  try {
    const { nom, couleur, icone } = req.body;
    const nouvelleCategorie = new Categorie({
      nom, couleur, icone,
      utilisateur: req.utilisateur.id 
    });

    const categorieSauvegardee = await nouvelleCategorie.save();
    res.status(201).json(categorieSauvegardee);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: "Catégorie déjà existante." });
    res.status(400).json({ message: "Erreur de création", detail: err.message });
  }
});

// recuperer les categories
router.get('/', async (req, res) => {
    try {
        const categories = await Categorie.find({ utilisateur: req.utilisateur.id }).sort({ nom: 1 });
        res.status(200).json(categories);
    } catch (err) {
        res.status(500).json({ message: "Erreur serveur", detail: err.message });
    }
});

// modifier une categorie
router.put('/:id', async (req, res) => {
    try {
        const { nom, couleur, icone } = req.body;
        const categorieMiseAJour = await Categorie.findOneAndUpdate(
            { _id: req.params.id, utilisateur: req.utilisateur.id }, 
            { nom, couleur, icone }, 
            { new: true, runValidators: true }
        );

        if (!categorieMiseAJour) return res.status(404).json({ message: "Catégorie introuvable." });
        res.status(200).json(categorieMiseAJour);
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "Ce nom est déjà utilisé." });
        res.status(400).json({ message: "Erreur de modification", detail: err.message });
    }
});

// supprimer une categorie
router.delete('/:id', async (req, res) => {
    try {
        const categorieSupprimee = await Categorie.findOneAndDelete({ 
            _id: req.params.id, 
            utilisateur: req.utilisateur.id 
        });

        if (!categorieSupprimee) return res.status(404).json({ message: "Catégorie introuvable." });
        res.status(200).json({ message: "Catégorie supprimée avec succès." });
    } catch (err) {
        res.status(500).json({ message: "Erreur serveur", detail: err.message });
    }
});

module.exports = router;