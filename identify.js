const express = require("express");
const router = express.Router();
const pool = require("./db");

router.post("/", async (req, res) => {
  const { email, phoneNumber } = req.body;

  if (!email && !phoneNumber) {
    return res.status(400).json({ error: "Email or phoneNumber required" });
  }

  try {
    // 1️⃣ Find matching contacts
    const result = await pool.query(
      `SELECT * FROM Contact 
       WHERE (email = $1 OR phoneNumber = $2) 
       AND deletedAt IS NULL
       ORDER BY createdAt ASC`,
      [email || null, phoneNumber || null]
    );

    const contacts = result.rows;

    // 2️⃣ No match → create primary
    if (contacts.length === 0) {
      const newContact = await pool.query(
        `INSERT INTO Contact (email, phoneNumber, linkPrecedence)
         VALUES ($1, $2, 'primary')
         RETURNING *`,
        [email, phoneNumber]
      );

      return res.status(200).json({
        contact: {
          primaryContatctId: newContact.rows[0].id,
          emails: email ? [email] : [],
          phoneNumbers: phoneNumber ? [phoneNumber] : [],
          secondaryContactIds: []
        }
      });
    }

    // 3️⃣ Find oldest primary
    let primary = contacts.find(c => c.linkprecedence === "primary");
    if (!primary) primary = contacts[0];

    // 4️⃣ Convert other primaries → secondary
    for (let contact of contacts) {
      if (contact.id !== primary.id && contact.linkprecedence === "primary") {
        await pool.query(
          `UPDATE Contact 
           SET linkPrecedence = 'secondary',
               linkedId = $1,
               updatedAt = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [primary.id, contact.id]
        );
      }
    }

    // 5️⃣ Check if new info needs secondary creation
    const emailExists = contacts.some(c => c.email === email);
    const phoneExists = contacts.some(c => c.phonenumber === phoneNumber);

    if ((!emailExists && email) || (!phoneExists && phoneNumber)) {
      await pool.query(
        `INSERT INTO Contact (email, phoneNumber, linkPrecedence, linkedId)
         VALUES ($1, $2, 'secondary', $3)`,
        [email, phoneNumber, primary.id]
      );
    }

    // 6️⃣ Fetch all linked contacts
    const allResult = await pool.query(
      `SELECT * FROM Contact
       WHERE id = $1 OR linkedId = $1
       AND deletedAt IS NULL
       ORDER BY createdAt ASC`,
      [primary.id]
    );

    const allContacts = allResult.rows;

    const emails = [
      ...new Set(allContacts.map(c => c.email).filter(Boolean))
    ];

    const phoneNumbers = [
      ...new Set(allContacts.map(c => c.phonenumber).filter(Boolean))
    ];

    const secondaryIds = allContacts
      .filter(c => c.linkprecedence === "secondary")
      .map(c => c.id);

    return res.status(200).json({
      contact: {
        primaryContatctId: primary.id,
        emails,
        phoneNumbers,
        secondaryContactIds: secondaryIds
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;