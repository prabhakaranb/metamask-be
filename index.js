const express = require('express')

const bodyParser = require('body-parser')

const admin = require("firebase-admin");

const Web3 = require("web3");

const { recoverPersonalSignature } = require("eth-sig-util");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const isValidEthAddress = (address) => Web3.utils.isAddress(address);

const makeId = (length) => {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  return result;
};

const getMessageToSign = async (req, res) => {
  try {
    const { address } = req.query;

    if (!isValidEthAddress(address)) {
      return res.send({ error: "invalid_address" });
    }

    const randomString = makeId(20);
    let messageToSign = `Wallet address: ${address} Nonce: ${randomString}`;

    // Get user data from firestore database
    const user = await admin.firestore().collection("users").doc(address).get();

    if (user.data() && user.data().messageToSign) {
      // messageToSign already exists for that particular wallet address
      messageToSign = user.data().messageToSign;
    } else {
      // messageToSign doesn't exist, save it to firestore database
      admin.firestore().collection("users").doc(address).set(
        {
          messageToSign,
        },
        {
          merge: true,
        }
      );
    }

    return res.send({ messageToSign, error: null });
  } catch (error) {
    console.log(error);
    return res.send({ error: "server_error" });
  }
};

const isValidSignature = (address, signature, messageToSign) => {
  if (!address || typeof address !== "string" || !signature || !messageToSign) {
    return false;
  }

  const signingAddress = recoverPersonalSignature({
    data: messageToSign,
    sig: signature,
  });

  if (!signingAddress || typeof signingAddress !== "string") {
    return false;
  }

  return signingAddress.toLowerCase() === address.toLowerCase();
};

const getJWT = async (req, res) => {
  try {
    const { address, signature } = req.query;

    if (!isValidEthAddress(address) || !signature) {
      return res.send({ error: "invalid_parameters" });
    }

    const [customToken, doc] = await Promise.all([
      admin.auth().createCustomToken(address),
      admin.firestore().collection("users").doc(address).get(),
    ]);

    if (!doc.exists) {
      return res.send({ error: "invalid_message_to_sign" });
    }

    const { messageToSign } = doc.data();

    if (!messageToSign) {
      return res.send({ error: "invalid_message_to_sign" });
    }

    const validSignature = isValidSignature(address, signature, messageToSign);

    if (!validSignature) {
      return res.send({ error: "invalid_signature" });
    }

    // Delete messageToSign as it can only be used once
    // admin.firestore().collection("users").doc(address).set(
    //   {
    //     messageToSign: null,
    //   },
    //   {
    //     merge: true,
    //   }
    // );

    return res.send({ customToken, error: null });
  } catch (err) {
    console.log("Error:", err);
    return res.send({ error: "server_error" });
  }
};

const saveInfo = async(req, res) => {
  try {
    const { address, signature , customToken } = req.body;
    admin.firestore().collection("users").doc(address).set(
      {
        signature,
        customToken
      },
      {
        merge: true,
      }
    );
    return res.send({ error: null });
  } catch (error) {
    
  }
}

const getUser = async (req, res) => {
  try {
    const { address } = req.query;
    const user = await admin.firestore().collection("users").doc(address).get();
    if(user) {
      const signature = user.data().signature
      const customToken = user.data().customToken
      const add = user.data().address
      const userRes = {address: add,signature,customToken}
      return res.send(userRes);
    } else {
      return res.send({ error: null });
    }
  } catch (error) {
    
  }
}

const cors = require('cors')

const app = express()
const port = 4000

app.use(cors())

app.use(bodyParser.json({ limit: '50mb' }))
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }))

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.get("/message", getMessageToSign);

app.get("/jwt", getJWT);

app.post("/signature", saveInfo);

app.get("/user", getUser);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})