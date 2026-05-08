const mongoose = require('mongoose');

// schema pour les transactions (depenses et revenus)
const transactionSchema = new mongoose.Schema({
  titre: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 100
  },
  montant: { 
    type: Number, 
    required: true,
    min: 0.01
  },
  type: { 
    type: String, 
    required: true, 
    enum: ['depense', 'revenu'] // limite les choix
  },
  date: { 
    type: Date, 
    default: Date.now,
    required: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: 250
  },
  categorie: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Categorie', 
    required: true 
  },
  utilisateur: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Utilisateur', 
    required: true 
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Transaction', transactionSchema);