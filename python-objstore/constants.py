""" Declaring constants used by the archive script. """

import os
import dotenv

envPath = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(envPath):
    print("loading dot env...")
    dotenv.load_dotenv()

#OBJ_STORE_ROOT_DIR = os.environ['OBJ_STORE_ROOT_DIR']
OBJ_STORE_BUCKET = os.environ['OBJ_STORE_BUCKET']
OBJ_STORE_SECRET = os.environ['OBJ_STORE_SECRET']
OBJ_STORE_USER = os.environ['OBJ_STORE_USER']
OBJ_STORE_HOST = os.environ['OBJ_STORE_HOST']
#OBJ_STORE_ACCESS_KEY = os.environ['OBJ_STORE_ACCESS_KEY']
#OBJ_STORE_SECRET_KEY = os.environ['OBJ_STORE_SECRET_KEY']
TEST_OBJ_NAME = os.environ['TEST_OBJ_NAME']
INDEX_FILE = os.environ['INDEX_FILE']

# bucket description of test bucket
OBJ_STORE_TST_BUCKET = os.environ['OBJ_STORE_TST_BUCKET']
OBJ_STORE_TST_SECRET = os.environ['OBJ_STORE_TST_SECRET']
OBJ_STORE_TST_USER = os.environ['OBJ_STORE_TST_USER']
OBJ_STORE_TST_HOST = os.environ['OBJ_STORE_TST_HOST']

TMP_FOLDER=os.environ['TMP_FOLDER']