const mongoose = require('mongoose');

// schema pour les categories
const categorieSchema = new mongoose.Schema({
  nom: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 50
  },
  couleur: { 
    type: String, 
    default: '#3498db'
  },
  icone: { 
    type: String, 
    default: 'folder' 
  },
  utilisateur: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Utilisateur', 
    required: true 
  }
}, {
  timestamps: true 
});

// eviter les categories en double pour le meme utilisateur
categorieSchema.index({ nom: 1, utilisateur: 1 }, { unique: true });

module.exports = mongoose.model('Categorie', categorieSchema);