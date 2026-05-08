const jwt = require('jsonwebtoken');
const Utilisateur = require('../models/Utilisateur'); 

const verifierToken = async (req, res, next) => {
    const headerAutorisation = req.header('Authorization');

    if (!headerAutorisation) {
        return res.status(401).json({ message: "Accès refusé. Aucun token fourni." });
    }

    try {
        const token = headerAutorisation.split(' ')[1];

        if (!token) {
             return res.status(401).json({ message: "Format du token invalide." });
        }

        // 1. Décodage du token
        const utilisateurVerifie = jwt.verify(token, process.env.JWT_SECRET);
        
        // 2. Vérifier si l'utilisateur existe toujours
        const id = utilisateurVerifie.id || utilisateurVerifie._id;
        const utilisateurExiste = await Utilisateur.findById(id);

        if (!utilisateurExiste) {
            return res.status(401).json({ message: "Cet utilisateur a été supprimé. Accès révoqué." });
        }

        // 3. 🛑 BLOCAGE DES ANCIENNES SESSIONS (Le cœur de la faille)
        if (utilisateurExiste.dateModificationMotDePasse) {
            // Le token 'iat' est en secondes, on le convertit en millisecondes
            const dateCreationToken = utilisateurVerifie.iat * 1000;
            const dateChangementMdp = utilisateurExiste.dateModificationMotDePasse.getTime();

            // Si le token a été créé AVANT le dernier changement de mot de passe, on le rejette !
            // (On soustrait 1 seconde pour éviter les bugs de millisecondes lors de la création simultanée)
            if (dateCreationToken < (dateChangementMdp - 1000)) {
                return res.status(401).json({ message: "Mot de passe modifié récemment. Votre session a expiré, veuillez vous reconnecter." });
            }
        }

        req.utilisateur = utilisateurVerifie; 
        next(); 
    } catch (erreur) {
        res.status(401).json({ message: "Token invalide ou expiré." });
    }
};

module.exports = verifierToken;