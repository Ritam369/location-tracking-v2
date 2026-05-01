#!/bin/bash

mkdir -p cert

openssl genrsa -out cert/private-key.pem 2048
openssl rsa -in cert/private-key.pem -pubout -out cert/public-key.pub

echo "Keys generated in cert/"
