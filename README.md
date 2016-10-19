# Commercial Paper Demo

## Description
This application is a demonstration of how a commercial paper trading network might be implemented
on IBM Blockchain.  The components of the demo are:

* An interface for creating new users on the network.
* An interface for creating new commercial papers to trade.
* A Trade Center for buying and selling existing trades.
* A special interface just for auditors of the network to examine trades

## Getting Started

1. Clone this repository.
2. Create local network using docker-compose available [here](https://github.com/IBM-Blockchain/fabric-images).
3. Modify credentials as per your network in 'config.json' file.
4. Make sure the key/value store only has values for your current network (See below).
7. Run these commands in the cloned directory:

```shell
npm install
node app.js
```

## Using the Demo
1. Register some users using the registration form on the login page.
2. Save the credentials that are created for the users you register.  They appear just above the
registration form.
3. Use the credentials to log in to the application.  The UI you see will be determined by the role
that was assigned to each user.
4. Open the 'CREATE' tab to create new trades.
5. Open the 'TRADE' tab to participate in your commercial paper trading network.
6. Open the 'AUDIT' tab to view all of the trades on the network.

## Notes on the Key Value Store

When the fabric SDK is used to enroll users, the enrollment certificate for the user is downloaded from the CA and the
secret for the user you enrolled is invalidated.  Basically, nobody will be able to enroll the user again.  By default,
the SDK will download this certificate into a local key value store.  So, the only apps that will be able to use the
enrolled users are those that have access to the enrollment certificate.

#### Why is this a problem?

When this demo is initialized, it attempts to enroll one of the blockchain networks registrar users, `WebAppAdmin`, 
downloading the enrollment certificate for that user into the demo applications filesystem.  This will
prevent other demos or apps on that network from being able to use the `WebAppAdmin` user.  The message to take away
from all of this is that you should only use this demo on it's own blockchain network, for now.  

## Limitations

* Passwords don't mean anything in the demo.  We're working on it.  You still need to register users to interact with
the demo, but you can use anything in the password field to log in.

* Having the string 'auditor' in the username will cause the user to be registered as an auditor, while anything else
will register the user as a regular user, meaning that they can create and trade paper.  These limitations
will be fixed in future versions of the demo.

* Nothing happens when papers mature.

* For now, the permissions for auditors and regular users are only enforced within the web application.
An updated user architecture will be coming to the
fabric to fix this in the future.

