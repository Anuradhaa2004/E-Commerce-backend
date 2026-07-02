app.get('/ping', (req, res) => {
    res.status(200).send('I am alive');
});