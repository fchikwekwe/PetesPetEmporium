// MODELS
const Pet = require('../models/pet');

// UPLOADING TO AWS S3
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });
const Upload = require('s3-uploader');

const client = new Upload(process.env.s3_BUCKET, {
    aws: {
        path: 'pets/avatar',
        region: process.env.S3_REGION,
        acl: 'public-read',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    cleanup: {
        versions: true,
        original: true,
    },
    versions: [{
        maxWidth: 400,
        aspect: '16:10',
        suffix: '-standard',
    }, {
        maxWidth: 300,
        aspect: '1:1',
        suffix: '-square',
    }],
});

// PET ROUTES
module.exports = (app) => {

  // INDEX PET => index.js

  // NEW PET
  app.get('/pets/new', (req, res) => {
    res.render('pets-new');
  });

  // CREATE PET
  app.post('/pets', upload.single('avatar'), (req, res, next) => {
    // Instantiate a new Pet object
    var pet = new Pet(req.body);

    pet.save(function (err) {
        if (req.file) {
            client.upload(req.file.path, {}, function (err, versions, meta) {
                if (err) { return res.status(400).send({ err: err }) };

                versions.forEach((image) => {
                    const urlArray = image.url.split('-');
                    urlArray.pop();
                    const url = urlArray.join('-');
                    pet.avatarUrl = url;
                    pet.save();
                });
                res.send({ pet: pet });
            });
        } else {
            res.send({ pet: pet });
        }
      })
  });

  // SHOW PET
  app.get('/pets/:id', (req, res) => {
    Pet.findById(req.params.id).exec((err, pet) => {
      res.render('pets-show', {
          pet: pet,
          // For some reason app.locals was not working for this
          PUBLIC_STRIPE_API_KEY: process.env.PUBLIC_STRIPE_API_KEY,
      });
    });
  });

  // EDIT PET
  app.get('/pets/:id/edit', (req, res) => {
    Pet.findById(req.params.id).exec((err, pet) => {
      res.render('pets-edit', { pet: pet });
    });
  });

  // UPDATE PET
  app.put('/pets/:id', (req, res) => {
    Pet.findByIdAndUpdate(req.params.id, req.body)
      .then((pet) => {
        res.redirect(`/pets/${pet._id}`)
      })
      .catch((err) => {
        // Handle Errors
      });
  });

  // DELETE PET
  app.delete('/pets/:id', (req, res) => {
    Pet.findByIdAndRemove(req.params.id).exec((err, pet) => {
      return res.redirect('/')
    });
  });

  // SEARCH PET
  app.get('/search', (req, res) => {
      const term = new RegExp(req.query.term, 'i')
      const page = req.query.page || 1

      Pet.paginate(
          {
              $or: [
                {'name': term },
                {'species': term },
            ]
        },
        { page: page }).then((results) => {
             res.render('pets-index', {
                 pets: results.docs,
                 pagescount: results.pages,
                 currentPage: page,
                 term: req.query.term,
                 hasPreviousPages: page > 1,
                 hasNextPages: page < results.pages,
             });
          });
      });

    // PURCHASE PET
    app.post('/pets/:id/purchase', (req, res) => {
        console.log(req.body);

        var stripe = require('stripe')(process.env.PRIVATE_STRIPE_API_KEY);

        const token = req.body.stripeToken;
        Pet.findById(req.body.petId).exec((err, pet) => {
            const charge = stripe.charges.create({
                amount: pet.price * 100,
                currency: 'usd',
                description: `Purchased ${pet.name}, ${pet.species}`,
                source: token,
            })
            .then((charge) => {
                res.redirect(`/pets/${req.params.id}`);
            });
        });
    });
}
