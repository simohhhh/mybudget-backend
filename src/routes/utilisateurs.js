const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer'); 
const dns = require('dns').promises; 
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // Indispensable pour gérer les dossiers
const verifierToken = require('../middlewares/authMiddleware');
const Utilisateur = require('../models/Utilisateur');

const { 
    getProfilUtilisateur, 
    updateProfilUtilisateur, 
    supprimerCompte, 
    motDePasseOublie, 
    reinitialiserMotDePasse,
    envoyerMessageSupport
} = require('../controllers/utilisateurController');

const emailRegexStrict = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,6}$/;

async function verifierDomaineEmail(email) {
    try {
        const domaine = email.split('@')[1].trim(); 
        const records = await dns.resolveMx(domaine);
        return records && records.length > 0;
    } catch (error) {
        console.warn(`[Avertissement Réseau] Impossible de vérifier le DNS pour ${email}.`);
        return true; 
    }
}

// ==========================================
// 💡 CONFIGURATION MULTER POUR L'AVATAR (CORRIGÉE)
// ==========================================
// Pointe exactement vers votre dossier "src/uploads"
const dossierUploads = path.join(__dirname, '../uploads');

// Crée le dossier s'il n'existe pas
if (!fs.existsSync(dossierUploads)) {
    fs.mkdirSync(dossierUploads, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, dossierUploads); // Utilisation du chemin absolu
    },
    filename: function (req, file, cb) {
        // Utilisation de Date.now() pour éviter les erreurs d'ID introuvable
        const nomUnique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'avatar-' + nomUnique + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// ==========================================
// ROUTES PRIVÉES
// ==========================================
router.get('/me', verifierToken, getProfilUtilisateur);
router.put('/profil', verifierToken, updateProfilUtilisateur);
router.delete('/me', verifierToken, supprimerCompte);
router.post('/support', verifierToken, envoyerMessageSupport);

// NOUVELLE ROUTE : UPLOAD AVATAR
router.post('/avatar', verifierToken, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "Aucune image fournie." });
        }
        
        const avatarUrl = `http://localhost:3000/uploads/${req.file.filename}`;
        
        await Utilisateur.findByIdAndUpdate(req.utilisateur.id, { avatar: avatarUrl });
        res.status(200).json({ message: "Avatar mis à jour", avatarUrl: avatarUrl });
    } catch (erreur) {
        console.error("🔴 ERREUR D'UPLOAD AVATAR :", erreur);
        res.status(500).json({ message: "Erreur serveur lors de l'upload.", detail: erreur.message });
    }
});

// ==========================================
// ROUTES PUBLIQUES
// ==========================================
router.post('/mot-de-passe-oublie', motDePasseOublie);
router.post('/reinitialiser-mot-de-passe/:token', reinitialiserMotDePasse);

// ==========================================
// 1. INSCRIPTION 
// ==========================================
router.post('/', async (req, res) => {
    try {
        const { nom, email, motDePasse } = req.body;

        if (!nom || !email || !motDePasse) {
            return res.status(400).json({ message: "Veuillez remplir tous les champs." });
        }

        const emailNettoye = email.trim().toLowerCase();

        if (!emailRegexStrict.test(emailNettoye)) {
            return res.status(400).json({ message: "Format d'email non valide." });
        }

        const domaineValide = await verifierDomaineEmail(emailNettoye);
        if (!domaineValide) {
            return res.status(400).json({ message: "Le domaine de cet email n'existe pas." });
        }

        let utilisateur = await Utilisateur.findOne({ email: emailNettoye });

        if (utilisateur) {
            if (utilisateur.isVerified) {
                return res.status(400).json({ message: "Cet email est déjà utilisé." });
            } else {
                const salt = await bcrypt.genSalt(10);
                utilisateur.motDePasse = await bcrypt.hash(motDePasse, salt);
                utilisateur.nom = nom; 
            }
        } else {
            const salt = await bcrypt.genSalt(10);
            const motDePasseHache = await bcrypt.hash(motDePasse, salt);
            utilisateur = new Utilisateur({ nom, email: emailNettoye, motDePasse: motDePasseHache });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        utilisateur.otpCode = otp;
        utilisateur.otpExpire = new Date(Date.now() + 15 * 60000);

        await utilisateur.save();

        const transporter = nodemailer.createTransport({
            host: 'smtp.zoho.com', port: 465, secure: true, 
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });

        await transporter.sendMail({
            from: `"MyBudget Support" <${process.env.EMAIL_USER}>`, 
            to: emailNettoye,
            subject: 'Vérifiez votre adresse email - MyBudget',
            html: `<div style="font-family:sans-serif;text-align:center;">
                    <h2>Code de vérification</h2>
                    <h1 style="color:#2563eb;letter-spacing:5px;">${otp}</h1>
                   </div>`
        });

        res.status(201).json({ message: "Un code de vérification a été envoyé !" });
    } catch (erreur) {
        res.status(500).json({ message: "Erreur serveur", erreur: erreur.message });
    }
});

// ==========================================
// 2. VÉRIFIER L'INSCRIPTION (OTP)
// ==========================================
router.post('/verify-email', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const emailNettoye = email.trim().toLowerCase();
        
        const utilisateur = await Utilisateur.findOne({ email: emailNettoye });

        if (!utilisateur || utilisateur.otpCode !== otp || utilisateur.otpExpire < new Date()) {
            return res.status(400).json({ message: "Code incorrect ou expiré." });
        }

        utilisateur.isVerified = true;
        utilisateur.otpCode = null;
        utilisateur.otpExpire = null;
        await utilisateur.save();

        res.json({ message: "Compte vérifié avec succès !" });
    } catch (err) {
        res.status(500).json({ message: "Erreur de validation." });
    }
});

// ==========================================
// 3. CONNEXION (Login)
// ==========================================
router.post('/login', async (req, res) => {
    try {
        const { email, motDePasse } = req.body;
        const emailNettoye = email.trim().toLowerCase();
        
        const utilisateur = await Utilisateur.findOne({ email: emailNettoye });

        if (!utilisateur) return res.status(400).json({ message: "Identifiants incorrects." });
        if (!utilisateur.isVerified) {
            return res.status(403).json({ message: "Compte non activé. Veuillez vous réinscrire." });
        }

        const motDePasseValide = await bcrypt.compare(motDePasse, utilisateur.motDePasse);
        if (!motDePasseValide) return res.status(400).json({ message: "Identifiants incorrects." });

        const token = jwt.sign({ id: utilisateur._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

        res.status(200).json({ 
            token, 
            utilisateur: { id: utilisateur._id, nom: utilisateur.nom, email: utilisateur.email } 
        });
    } catch (erreur) {
        res.status(500).json({ message: "Erreur serveur" });
    }
});

// ==========================================
// 4. CHANGEMENT EMAIL (DEMANDE OTP)
// ==========================================
router.post('/demander-changement-email', verifierToken, async (req, res) => {
    try {
        const nouvelEmail = req.body.nouvelEmail.trim().toLowerCase();
        
        if (!emailRegexStrict.test(nouvelEmail)) {
            return res.status(400).json({ message: "Format d'email non valide." });
        }

        const domaineValide = await verifierDomaineEmail(nouvelEmail);
        if (!domaineValide) {
            return res.status(400).json({ message: "Le domaine de cet email n'existe pas." });
        }

        const existeDeja = await Utilisateur.findOne({ email: nouvelEmail });
        if (existeDeja) return res.status(400).json({ message: "Cet email est déjà utilisé." });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await Utilisateur.findByIdAndUpdate(req.utilisateur.id, {
            pendingEmail: nouvelEmail,
            otpCode: otp,
            otpExpire: new Date(Date.now() + 15 * 60000)
        });

        const transporter = nodemailer.createTransport({
            host: 'smtp.zoho.com', port: 465, secure: true, 
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });

        await transporter.sendMail({
            from: `"MyBudget Support" <${process.env.EMAIL_USER}>`, 
            to: nouvelEmail,
            subject: "Confirmation de changement d'email",
            html: `<p>Votre code de confirmation est : <b>${otp}</b></p>`
        });

        res.json({ message: "Code envoyé." });
    } catch (err) {
        res.status(500).json({ message: "Erreur lors de l'envoi." });
    }
});

// ==========================================
// 5. CONFIRMER CHANGEMENT EMAIL
// ==========================================
router.post('/confirmer-changement-email', verifierToken, async (req, res) => {
    try {
        const { otp } = req.body;
        const utilisateur = await Utilisateur.findById(req.utilisateur.id);

        if (!utilisateur || utilisateur.otpCode !== otp || utilisateur.otpExpire < new Date()) {
            return res.status(400).json({ message: "Code incorrect ou expiré." });
        }

        utilisateur.email = utilisateur.pendingEmail;
        utilisateur.pendingEmail = null;
        utilisateur.otpCode = null;
        utilisateur.otpExpire = null;
        await utilisateur.save();

        res.json({ message: "Email mis à jour !" });
    } catch (err) {
        res.status(500).json({ message: "Erreur serveur." });
    }
});

module.exports = router;