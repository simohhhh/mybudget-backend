const Utilisateur = require('../models/Utilisateur');
const Transaction = require('../models/Transaction');
const Categorie = require('../models/Categorie');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// 🟢 GET : Récupérer le profil
const getProfilUtilisateur = async (req, res) => {
    try {
        const id = req.utilisateur.id || req.utilisateur._id;
        const utilisateur = await Utilisateur.findById(id).select('-motDePasse');

        if (!utilisateur) return res.status(404).json({ message: "Utilisateur introuvable." });

        res.json({
            _id: utilisateur._id,
            nom: utilisateur.nom,
            email: utilisateur.email,
            avatar: utilisateur.avatar, // 💡 AJOUT DE L'AVATAR ICI
            dateCreation: utilisateur.dateCreation
        });
    } catch (erreur) {
        res.status(500).json({ message: "Erreur serveur lors de la récupération du profil." });
    }
};

// 🟡 PUT : Mettre à jour le profil (Nom & Mot de passe)
const updateProfilUtilisateur = async (req, res) => {
    try {
        const id = req.utilisateur.id || req.utilisateur._id;
        const utilisateur = await Utilisateur.findById(id);

        if (!utilisateur) return res.status(404).json({ message: "Utilisateur introuvable." });

        // 1. Mise à jour du nom uniquement (L'email est géré par OTP désormais)
        if (req.body.nom) utilisateur.nom = req.body.nom;

        let nouveauToken = null;

        // 2. Mise à jour du mot de passe
        if (req.body.nouveauMotDePasse && req.body.motDePasseActuel) {
            const isMatch = await bcrypt.compare(req.body.motDePasseActuel, utilisateur.motDePasse);
            if (!isMatch) {
                return res.status(400).json({ message: "Le mot de passe actuel est incorrect." });
            }
            const salt = await bcrypt.genSalt(10);
            utilisateur.motDePasse = await bcrypt.hash(req.body.nouveauMotDePasse, salt);
            
            // Ceci invalide l'ancien token dans le authMiddleware...
            utilisateur.dateModificationMotDePasse = Date.now();

            // ...Donc on DOIT générer un nouveau token pour garder l'utilisateur connecté !
            nouveauToken = jwt.sign({ id: utilisateur._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
        }

        const utilisateurMisAJour = await utilisateur.save();

        res.json({
            _id: utilisateurMisAJour._id,
            nom: utilisateurMisAJour.nom,
            email: utilisateurMisAJour.email,
            avatar: utilisateurMisAJour.avatar, // 💡 AJOUT DE L'AVATAR ICI AUSSI
            token: nouveauToken // On envoie le nouveau token au Frontend
        });
    } catch (erreur) {
        res.status(500).json({ message: "Erreur lors de la mise à jour." });
    }
};

// 🔴 DELETE : Supprimer définitivement le compte
const supprimerCompte = async (req, res) => {
    try {
        const id = req.utilisateur.id || req.utilisateur._id;
        const utilisateur = await Utilisateur.findById(id);
        if (!utilisateur) return res.status(404).json({ message: "Utilisateur introuvable." });

        await Transaction.deleteMany({ utilisateur: id }); 
        await Categorie.deleteMany({ utilisateur: id }); 
        await Utilisateur.findByIdAndDelete(id);

        res.json({ message: "Compte, transactions et catégories supprimés avec succès." });
    } catch (erreur) {
        res.status(500).json({ message: "Erreur serveur lors de la suppression." });
    }
};


// 📧 DEMANDER LA RÉINITIALISATION
const motDePasseOublie = async (req, res) => {
    try {
        const { email } = req.body;
        
        // L'ASTUCE ICI : On nettoie l'email reçu du Frontend
        const emailNettoye = email.trim().toLowerCase();
        
        const utilisateur = await Utilisateur.findOne({ email: emailNettoye });

        if (!utilisateur) return res.status(404).json({ message: "Aucun compte n'est associé à cette adresse email." });
        if (!utilisateur.isVerified) return res.status(403).json({ message: "Ce compte n'a pas encore été vérifié." });

        const resetToken = jwt.sign({ id: utilisateur._id }, process.env.JWT_SECRET, { expiresIn: '15m' });
        const resetUrl = `http://localhost:5173/ResetPassword/${resetToken}`;

        const transporter = nodemailer.createTransport({
            host: 'smtp.zoho.com', port: 465, secure: true, 
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });

        await transporter.sendMail({
            from: `"MyBudget Support" <${process.env.EMAIL_USER}>`, 
            to: utilisateur.email,
            subject: 'Réinitialisation de votre mot de passe - MyBudget',
            html: `
                <div style="font-family: sans-serif; text-align: center; padding: 20px;">
                    <h2 style="color: #2563eb;">Réinitialisation</h2>
                    <p>Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
                    <a href="${resetUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; margin-top: 20px;">
                        Réinitialiser mon mot de passe
                    </a>
                </div>
            `
        });

        res.json({ message: "Email de réinitialisation envoyé avec succès." });
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur serveur lors de l'envoi de l'email." });
    }
};

// 🔐 2. CRÉER LE NOUVEAU MOT DE PASSE ET VALIDER LE COMPTE
const reinitialiserMotDePasse = async (req, res) => {
    try {
        const { token } = req.params;
        const { nouveauMotDePasse } = req.body;

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const utilisateur = await Utilisateur.findById(decoded.id);
        
        if (!utilisateur) return res.status(404).json({ message: "Utilisateur introuvable." });

        const salt = await bcrypt.genSalt(10);
        utilisateur.motDePasse = await bcrypt.hash(nouveauMotDePasse, salt);

        utilisateur.isVerified = true; 
        utilisateur.otpCode = null; 
        utilisateur.otpExpire = null;
        utilisateur.dateModificationMotDePasse = Date.now();

        await utilisateur.save();
        res.json({ message: "Mot de passe mis à jour et compte activé avec succès !" });
    } catch (erreur) {
        if (erreur.name === 'TokenExpiredError') return res.status(400).json({ message: "Le lien a expiré." });
        res.status(400).json({ message: "Lien invalide ou expiré." });
    }
};

// 🎧 ENVOYER UN MESSAGE AU SUPPORT
const envoyerMessageSupport = async (req, res) => {
    const { nom, email, telephone, message } = req.body;

    try {
        const transporter = nodemailer.createTransport({
            host: 'smtp.zoho.com', port: 465, secure: true, 
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });

        await transporter.sendMail({
            from: `"Support MyBudget" <${process.env.EMAIL_USER}>`, 
            to: process.env.EMAIL_USER,
            replyTo: email,
            subject: `[Assistance MyBudget] Nouveau ticket de ${nom}`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                    <h2 style="color: #2563eb;">Nouveau message de support</h2>
                    <p><strong>Nom :</strong> ${nom}</p>
                    <p><strong>Email :</strong> <a href="mailto:${email}">${email}</a></p>
                    <p><strong>Téléphone :</strong> ${telephone || 'Non renseigné'}</p>
                    <h3 style="color: #334155; margin-top: 20px;">Message :</h3>
                    <div style="background-color: #f1f5f9; padding: 15px; border-radius: 8px; white-space: pre-wrap;">${message}</div>
                </div>
            `
        });

        res.json({ message: "Message envoyé avec succès." });
    } catch (erreur) {
        console.error("Erreur d'envoi de l'email de support :", erreur);
        res.status(500).json({ message: "Erreur serveur lors de l'envoi." });
    }
};

module.exports = { 
    getProfilUtilisateur, 
    updateProfilUtilisateur, 
    supprimerCompte, 
    motDePasseOublie, 
    reinitialiserMotDePasse,
    envoyerMessageSupport 
};