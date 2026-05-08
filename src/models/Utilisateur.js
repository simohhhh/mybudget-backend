const mongoose = require('mongoose');

// Fonction pour formater le nom propre (Première lettre majuscule)
function formaterNom(nom) {
    if (!nom) return nom; 
    let mots = nom.split(" ");
    for(let i = 0; i < mots.length; i++){
        mots[i] = mots[i].charAt(0).toUpperCase() + mots[i].slice(1).toLowerCase();
    }
    return mots.join(" ");
}

const utilisateurSchema = new mongoose.Schema({
    nom: {
        type: String,
        required: true,
        set: formaterNom
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    avatar: {
        type: String,
        default: ""
    },
    motDePasse: {
        type: String,
        required: true
    },
    dateModificationMotDePasse: {
        type: Date,
        default: null
    },
    isVerified: {
        type: Boolean,
        default: false 
    },
    otpCode: {
        type: String,
        default: null
    },
    otpExpire: {
        type: Date,
        default: null
    },
    pendingEmail: {
        type: String,
        default: null
    },
    dateCreation: {
        type: Date,
        default: Date.now
    }
});

// Nettoyage automatique des comptes non vérifiés après expiration de l'OTP
utilisateurSchema.index(
    { otpExpire: 1 }, 
    { expireAfterSeconds: 0, partialFilterExpression: { isVerified: false } }
);

module.exports = mongoose.model('Utilisateur', utilisateurSchema);