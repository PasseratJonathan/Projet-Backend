const Book = require('../models/Book')
const fs = require('fs')
const sharp = require('sharp')
const path = require('path')


exports.createBook = async (req, res) => {
  const bookObject = JSON.parse(req.body.book);
  delete bookObject._id;
  delete bookObject._userId;

  if (req.file) {
    const processedImageFilename = `${req.file.filename.split('.')[0]}_sharp.jpg`;

    const processedImagePath = path.join(__dirname, '../images', processedImageFilename);

    await sharp(req.file.path)
      .resize(600)
      .toFile(processedImagePath);

    fs.unlinkSync(req.file.path);
    const book = new Book({
      ...bookObject,
      imageUrl: `${req.protocol}://${req.get('host')}/images/${processedImageFilename}`,
      userId: req.auth.userId,
    });

    await book.save();

    res.status(201).json({ message: 'Objet enregistré' });
  } else {
    const book = new Book({
      ...bookObject,
      userId: req.auth.userId,
    });

    await book.save();

    res.status(201).json({ message: 'Objet enregistré' });
  }
};

exports.modifyBook = (req, res) => {
    const bookObject = req.file ? {
      ...JSON.parse(req.body.book),
      imageUrl: `${req.protocol}://${req.get('host')}/images/${req.file.filename}`
    } : { ...req.body }
    Book.findOne({_id: req.params.id})
    .then((book) => {
      if (book.userId != req.auth.userId) {
        res.status(401).json({ message: 'Non-autorisé'})
      } else {
        Book.updateOne({ _id: req.params.id}, { ...bookObject, _id: req.params.id})
        .then(() => res.status(200).json({message : 'Objet Modifié !'}))
        .catch(error => res.status(401).json({ error }))
      }
    })
    .catch((error) => {
      res.status(400).json({ error })
    })
  }

exports.deleteBook = (req, res) => {
    Book.findOne({ _id: req.params.id })
    .then(book => {
      if (book.userId != req.auth.userId) {
        res.status(401).json({message: 'Non autorisé' })
      } else {
        const filename = book.imageUrl.split('/images/')[1]
        fs.unlink(`images/${filename}`, () => {
          Book.deleteOne({_id: req.params.id})
          .then(() => { res.status(200).json({message: 'Objet supprimé !'})})
          .catch(error => res.status(401).json({ error }))
        })
      }
    })
    .catch(error => {
      res.status(500).json({ error })
    })
  }

exports.getOneBook = (req, res) => {
    Book.findOne({ _id: req.params.id })
    .then(book => res.status(200).json(book))
    .catch(error => res.status(404).json({ error }))
  }

exports.getAllBooks = (req, res) => {
    Book.find()
    .then(books => {
      res.status(200).json(books)
    }) 
    .catch(error => {
      console.log(error)
    })
    
  }

  exports.getBestRating = (req, res) => {
    Book.find()
      .sort({ averageRating: -1 })
      .limit(3)
      .exec()
      .then(books => {
        res.status(200).json(books);
      })
      .catch(error => {
        console.log(error);
        res.status(400).json({ error });
      });
  };

  exports.addNotation = (req, res) => {
    const { userId, rating } = req.body;
  
    Book.aggregate([
      { $match: { _id: req.params.id } },
      { $unwind: "$ratings" },
      {
        $group: {
          _id: null,
          totalRating: { $sum: "$ratings.grade" },
          ratingCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          averageRating: { $divide: ["$totalRating", "$ratingCount"] },
        },
      },
    ])
      .then(results => {
        const ratings = results[0]?.ratings?.map(r => r.grade) || []
        ratings.push(rating)
        const averageRating = ratings.length > 0 ? ratings.reduce((sum, currentGrade) => sum + currentGrade, 0) / ratings.length : 0;
  
        Book.findOneAndUpdate(
          { _id: req.params.id },
          { $push: { ratings: { userId, grade: rating } }, averageRating },
          { new: true }
        )
          .then(updatedBook => {
            if (!updatedBook) {
              return res.status(404).json({ message: 'Livre non trouvé' });
            }
            res.status(200).json(updatedBook);
          })
          .catch(error => {
            console.error(error);
            res.status(500).json({ error });
          });
      })
      .catch(error => {
        console.error(error);
        res.status(500).json({ error });
      });
  };