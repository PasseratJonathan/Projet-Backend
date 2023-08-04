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
    fs.renameSync( processedImagePath, req.file.path )
    const book = new Book({
      ...bookObject,
      imageUrl: `${req.protocol}://${req.get('host')}/images/${req.file.filename}`,
      userId: req.auth.userId,
    });

    await book.save();

    res.status(201).json({ message: 'Objet enregistré' });
  }
};

exports.modifyBook = async (req, res) => {
  try {
    let bookObject = req.file
      ? {
          ...JSON.parse(req.body.book),
          imageUrl: `${req.protocol}://${req.get('host')}/images/${req.file.filename}`,
        }
      : { ...req.body };

    if (req.file) {
      const processedImageFilename = `${req.file.filename.split('.')[0]}_sharp.jpg`;
      const processedImagePath = path.join(__dirname, '../images', processedImageFilename);

      await sharp(req.file.path)
        .resize(600)
        .toFile(processedImagePath);

      fs.unlinkSync(req.file.path);
      fs.renameSync( processedImagePath, req.file.path )

      bookObject.imageUrl = `${req.protocol}://${req.get('host')}/images/${req.file.filename}`;
    }

    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ message: 'Livre non trouvé' });
    }

    if (book.userId != req.auth.userId) {
      return res.status(401).json({ error });
    }

    if (req.file)  {
      try {
      const existingImagePath = path.join(__dirname, '../images', book.imageUrl.split('/').pop());
      fs.unlinkSync(existingImagePath);
      } catch (e) {console.error(e)}
    }

    book.title = bookObject.title;
    book.author = bookObject.author;
    book.year = bookObject.year;
    book.genre = bookObject.genre;
    book.imageUrl = bookObject.imageUrl;

    await book.save();

    res.status(200).json({ message: 'Livre modifié avec succès' });
  } catch (error) {
    res.status(500).json({ error });
  }
};

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
  }

  exports.addNotation = (req, res) => {
    const { userId, rating } = req.body;
  
    const newRating = parseInt(rating, 10);
    if (isNaN(newRating) || newRating < 0 || newRating > 5) {
      return res.status(400).json({ message: 'La note doit être comprise entre 0 et 5' });
    }
  
    Book.findById(req.params.id)
      .then(book => {
        if (!book) {
          return res.status(404).json({ message: 'Livre non trouvé' });
        }
  
        const userRating = book.ratings.find(r => r.userId === userId);
        if (userRating) {
          return res.status(400).json({ message: 'Vous avez déjà noté ce livre' });
        }
        book.ratings.push({ userId, grade: newRating });
  
        const totalRating = book.ratings.reduce((sum, r) => sum + r.grade, 0);
        book.averageRating = totalRating / book.ratings.length;
  
        book.save()
          .then(updatedBook => {
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