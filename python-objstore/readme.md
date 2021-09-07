# Overview

Contains python script that is used to set the individual objects in object
store to be publicly accessible.  In other words it would allow anyone with
the url to get access to the documents through the s3 api.

# Running the Script

## install dependencies and activate virtualenv

```
python -m virtualenv venv
source ./venv/bin/activate
pip install -r requirements.txt
```

configure the following environment variables:

* OBJ_STORE_BUCKET
* OBJ_STORE_SECRET
* OBJ_STORE_USER
* OBJ_STORE_HOST

## running the script

This will iterate over every object in the bucket and configure the permissions
for them as 'public / READ'

```
python publishObjectStore.py
```