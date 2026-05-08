const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const verifierToken = require('../middlewares/authMiddleware');

// middleware de protection
router.use(verifierToken);

// recuperer les stats du dashboard pour le mois en cours
router.get('/dashboard', async (req, res) => {
    try {
        const utilisateurId = new mongoose.Types.ObjectId(req.utilisateur.id);
        const dateActuelle = new Date();
        const premierJour = new Date(dateActuelle.getFullYear(), dateActuelle.getMonth(), 1);
        const dernierJour = new Date(dateActuelle.getFullYear(), dateActuelle.getMonth() + 1, 0);

        // calcul des totaux revenus/depenses
        const globaux = await Transaction.aggregate([
            { $match: { utilisateur: utilisateurId, date: { $gte: premierJour, $lte: dernierJour } } },
            { $group: { _id: "$type", total: { $sum: "$montant" } } }
        ]);

        let totalRevenus = 0;
        let totalDepenses = 0;
        globaux.forEach(item => {
            if (item._id === 'revenu') totalRevenus = item.total;
            if (item._id === 'depense') totalDepenses = item.total;
        });

        // repartition des depenses pour le graphique
        const parCategorie = await Transaction.aggregate([
            { $match: { utilisateur: utilisateurId, type: 'depense', date: { $gte: premierJour, $lte: dernierJour } } },
            { $group: { _id: "$categorie", total: { $sum: "$montant" } } },
            { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "det" } },
            { $unwind: "$det" },
            { $project: { _id: 0, nom: "$det.nom", couleur: "$det.couleur", total: 1 } }
        ]);

        res.status(200).json({
            totalRevenus,
            totalDepenses,
            solde: totalRevenus - totalDepenses,
            donnees: parCategorie 
        });
    } catch (err) {
        res.status(500).json({ message: "Erreur de calcul des stats", detail: err.message });
    }
});

module.exports = router;