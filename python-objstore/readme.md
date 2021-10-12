# Overview

Contains various python script that area used to:
    * modify permissions
    * move data from one bucket to another

# Changing Permissions Script - publishObjectStore.py

This script will iterate over every object in a bucket and make them all
public/read as their permissions.

## install dependencies and activate virtualenv

```
python -m virtualenv venv
source ./venv/bin/activate
pip install -r requirements.txt
```

## Environment Variables:

Set the following env vars before running the script.

PROD object store bucket, all data required by app should be located here
* OBJ_STORE_BUCKET - prod bucket name
* OBJ_STORE_SECRET - prod bucket secret
* OBJ_STORE_USER   - prod bucket user
* OBJ_STORE_HOST   - prod host

TEST object store bucket, data in here is to be moved to prod bucket
* OBJ_STORE_TST_BUCKET  - test bucket name
* OBJ_STORE_TST_SECRET  - test secret
* OBJ_STORE_TST_USER    - test user
* OBJ_STORE_TST_HOST    - test host

TMP_FOLDER              - temp folder where any temp data will be downloaded to
INDEX_FILE              - path to where the local copy of the index file is
                          located
TEST_OBJ_NAME           - name of a object store file that is used for
                          debugging


## running the script

This will iterate over every object in the bucket and configure the permissions
for them as 'public / READ'

```
python publishObjectStore.py
```

# Data Consolidation Script - consolidate_objstores.py

This script iterates over the index file and copies all the data in the test
object store bucket to prod so all the prod data is in one place.

Created a dockerfile to bundle into a container.  The following are the instructions
used to build the image and also the instructions to run.

```
# building the image
podman image build -t wrf:consolidate-object-store-data -f consolicate_objstores.docker .

# create the tmp volume
podman volume create temp-storage

# run the pod with env vars
podman run -v temp-storage:/data --env TMP_FOLDER=/data --env INDEX_FILE=./wrf_fileindex.csv --env-file=.env  -it wrf:consolidate-object-store-data
```


