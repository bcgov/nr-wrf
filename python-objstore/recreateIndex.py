"""Originally the air quality index data was uploaded to two different
S3 buckets.  The data has been consolidated into a single bucket, and now
need to regenerate the index file.

Seeing as we are not spanning multiple buckets we are also going to simplify
the structure of the index file.
"""

import constants
import os
import objStoreUtil
import logging

LOGGER = logging.getLogger()

class CreateIndex:

    def __init__(self):
        self.tmpFolder = constants.TMP_FOLDER

        self.csvFile = r'oldWRFIndexFile.csv'
        self.oldWrfFile = os.path.join(self.tmpFolder, constants.INDEX_FILE)
        self.newWrfFile = os.path.join(self.tmpFolder, 'wrf_fileindex_v2.csv')


        self.objStrUtil = objStoreUtil.ObjectStoreUtil(
            objStoreHost=constants.OBJ_STORE_HOST,
            objStoreUser=constants.OBJ_STORE_TST_USER,
            objStoreSecret=constants.OBJ_STORE_TST_SECRET,
            objStoreBucket=constants.OBJ_STORE_TST_BUCKET,
            tmpfolder=self.tmpFolder
        )
        self.getWRFIndexFile()

    def getWRFIndexFile(self):
        """The WRF Index file is the layer that glues the geographic extents
        of the air quality data to files that reside in object store.  The
        index file is stored in object storage.

        The first thing the script does is attempt to pull this file down
        from object storage to local storage and then iterate over the
        contents of the file.
        """
        LOGGER.info("checking on cached version of existing index file")
        if not os.path.exists(self.csvFile):
            csvFile = os.path.join(self.tmpFolder, os.path.basename(self.csvFile))
            oldWrfFile = os.path.basename(self.oldWrfFile)
            LOGGER.info(f'retrieving the index file: {oldWrfFile}')
            self.objStrUtil.getObject(oldWrfFile, csvFile)

    def reCreate(self):
        """deletes existing new wrf file,
        iterates over old file and generated new
        """
        if os.path.exists(self.newWrfFile):
            LOGGER.info("deleting existing new WRF file")
            os.remove(self.newWrfFile)

        columns2Copy = ['filename', 'I0','J0','I1','J1','date','LAT0','LON0',
                        'LAT1','LON1']

        with open(self.newWrfFile, 'w') as fhWrite:
            with open(self.oldWrfFile, 'r') as fhRead:
                header = fhRead.readline().strip().split(',')
                positions = []
                colCnt = 0
                for columnName in header:
                    if columnName in columns2Copy:
                        positions.append(colCnt)
                    colCnt += 1

                for line in fhRead:
                    inElems = line.strip().split(',')
                    outElems = [inElems[i] for i in positions]
                    outLine = ','.join(outElems) + '\n'
                    fhWrite.write(outLine)










if __name__ == '__main__':
    # -- log config
    LOGGER.setLevel(logging.DEBUG)
    hndlr = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(lineno)d - %(message)s')
    hndlr.setFormatter(formatter)
    LOGGER.addHandler(hndlr)
    LOGGER.debug("test")

    urllibLog = logging.getLogger('urllib3.connectionpool')
    urllibLog.setLevel(logging.INFO)

    # --
    ci = CreateIndex()
    ci.getWRFIndexFile()
    ci.reCreate()
