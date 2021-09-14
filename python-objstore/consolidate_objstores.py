"""Initially the data was uploaded to two buckets.

This script will:
    a) iterate over the contents of the index file
    b) look for content in the test namespace and move it to the prod
        namespace.
"""

import csv
import json
import logging
import os
import sys
import re

import constants
import objStoreUtil

LOGGER = logging.getLogger()


class ConsolidateStorage:

    def __init__(self, csvFile=None):
        self.csvFile = csvFile
        if csvFile is None:
            self.csvFile = constants.INDEX_FILE
        LOGGER.debug(f"csv file being used: {self.csvFile}")

        self.checkParams()

        self.srcObjStoreUtil = objStoreUtil.ObjectStoreUtil(
            objStoreHost=constants.OBJ_STORE_HOST,
            objStoreUser=constants.OBJ_STORE_TST_USER,
            objStoreSecret=constants.OBJ_STORE_TST_SECRET,
            objStoreBucket=constants.OBJ_STORE_TST_BUCKET,
            tmpfolder=constants.TMP_FOLDER
        )

        self.destObjStoreUtil = objStoreUtil.ObjectStoreUtil(
            objStoreHost=constants.OBJ_STORE_HOST,
            objStoreUser=constants.OBJ_STORE_USER,
            objStoreSecret=constants.OBJ_STORE_SECRET,
            objStoreBucket=constants.OBJ_STORE_BUCKET,
            tmpfolder=constants.TMP_FOLDER
        )

        # cache for file lists
        self.srcCacheFile = os.path.join(constants.TMP_FOLDER, 'srcfiles.json')
        self.destCacheFile = os.path.join(constants.TMP_FOLDER, 'destfiles.json')
        LOGGER.debug(f"cache dir: {constants.TMP_FOLDER}")

    def checkParams(self):
        """checking to verify that the parameters the script expects have been
        populated
        """
        if not constants.TMP_FOLDER:
            msg = f'the env var TMP_FOLDER has not been set'
            raise ValueError(msg)
        parmListDest = ['OBJ_STORE_HOST', 'OBJ_STORE_USER', 'OBJ_STORE_SECRET', 'OBJ_STORE_BUCKET']
        parmListSrc = ['OBJ_STORE_TST_USER', 'OBJ_STORE_TST_BUCKET', 'OBJ_STORE_TST_SECRET']
        paramType = 'destination'
        for param in parmListDest:
            paramValue = getv
            if not param:
                msg = f'The {paramType} object store bucket parameter: {param} has not been populated'

        parmListDest = [constants.OBJ_STORE_HOST, constants.OBJ_STORE_USER, constants.OBJ_STORE_SECRET, constants.OBJ_STORE_BUCKET]
        parmListSrc = [constants.OBJ_STORE_TST_USER, constants.OBJ_STORE_TST_BUCKET, constants.OBJ_STORE_TST_SECRET]



    def getWRFIndexFile(self):
        """The WRF Index file is the layer that glues the geographic extents
        of the air quality data to files that reside in object store.  The
        index file is stored in object storage.

        The first thing the script does is attempt to pull this file down
        from object storage to local storage and then iterate over the
        contents of the file.
        """
        if not os.path.exists(self.csvFile):
            objStoreName = os.path.basename(self.csvFile)
            self.csvFile = os.path.join(constants.TMP_FOLDER, objStoreName)
            LOGGER.info(f'retrieving the index file: {objStoreName}')
            self.destObjStoreUtil.getObject(objStoreName, self.csvFile)

    def consolidate(self):
        rowCnt = 0
        bucketRegexStr = f'^.*{constants.OBJ_STORE_BUCKET}$'
        LOGGER.debug(f"regex str: {bucketRegexStr}")
        bucketRegex = re.compile(f'^.*{constants.OBJ_STORE_BUCKET}$')

        with open(self.csvFile, 'r') as csvfile:
            spamreader = csv.reader(csvfile, delimiter=',')
            header = csvfile.readline()

            cnt = 0
            for row in spamreader:
                rowDict = self.parseRow(row)
                if not bucketRegex.match(rowDict['bucketname']):
                    self.moveFile(rowDict['bucketname'], rowDict['filename'])
                    if cnt > 20:
                        raise
                    cnt += 1

    def parseRow(self, row):
        """gets a row with the following columns:
            filename,objectstorage,I0,J0,I1,J1,date,LAT0,LON0,LAT1,LON1

        returns a dict with the following keys:
        * filename - just the file name
        * bucketname - just the name of the bucket (license plate name)

        :param row: input row describing a file in object storage
        :type row: list
        """
        retDict = {}
        retDict['filename'] = row[0]

        retDict['bucketname'] = row[1].split(r'/')[3]
        #LOGGER.debug(f"bucket name: {retDict['bucketname']}")
        return retDict

    def getFileLists(self):
        """mostly used for debugging, gets a list of source and
        destination files and then caches the results.
        """

        if os.path.exists(self.srcCacheFile):
            with open(self.srcCacheFile, 'r') as fh:
                srcFiles = json.load(fh)
        else:
            LOGGER.info("getting the source file list")
            srcFiles = self.srcObjStoreUtil.listObjects(returnFileNamesOnly=True)
            with open(self.srcCacheFile, 'w') as fh:
                json.dump(srcFiles, fh)
        if os.path.exists(self.destCacheFile):
            with open(self.destCacheFile, 'r') as fh:
                destFiles = json.load(fh)
        else:
            LOGGER.info("getting the destination file list")
            destFiles = self.destObjStoreUtil.listObjects(returnFileNamesOnly=True)
            with open(self.destCacheFile, 'w') as fh:
                json.dump(destFiles, fh)
        return srcFiles, destFiles

    def moveFile(self, srcBucketname, srcFilename):
        """pulls the file down that is described by the bucket / filename
        combination, and copies it to the destination.

        :param bucketname: [description]
        :type bucketname: [type]
        :param filename: [description]
        :type filename: [type]
        """
        srcFiles, destFiles = self.getFileLists()
        try:
            #srcFiles = self.srcObjStoreUtil.listObjects(returnFileNamesOnly=True)
            #destFiles = self.destObjStoreUtil.listObjects(returnFileNamesOnly=True)
            for srcFile in srcFiles:
                if srcFile not in destFiles:
                    tmpPath = os.path.join(constants.TMP_FOLDER, srcFile)
                    if os.path.exists(tmpPath):
                        os.remove(tmpPath)
                    LOGGER.debug(f"getting the file: {srcFile}")
                    self.srcObjStoreUtil.getObject(srcFile, tmpPath)
                    LOGGER.debug(f"putting the file: {srcFile}")
                    self.destObjStoreUtil.putObject(srcFile, tmpPath)
                    srcFiles.remove(srcFile)
                    destFiles.append(srcFile)
                    # remove the temp file
                    if os.path.exists(tmpPath):
                        os.remove(tmpPath)
        except:
            LOGGER.warning("error detected, caching file copy status")
            self.cacheSrcDest(srcFiles, destFiles)
            raise

    def cacheSrcDest(self, srcFiles, destFiles):
        """getting a file list from source and destination can be time
        consuming, so maintaining a cache (mostly for debugging).  This
        method is typically called after an exception is raise and it re
        writes the data structs for src and dest to the json files.
        """
        with open(self.srcCacheFile, 'w') as fh:
            json.dump(srcFiles, fh)
        with open(self.destCacheFile, 'w') as fh:
            json.dump(destFiles, fh)




if __name__ == '__main__':
    LOGGER.setLevel(logging.DEBUG)
    hndlr = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(lineno)d - %(message)s')
    hndlr.setFormatter(formatter)
    LOGGER.addHandler(hndlr)
    LOGGER.debug("test")

    urllibLog = logging.getLogger('urllib3.connectionpool')
    urllibLog.setLevel(logging.INFO)

    wrfIndexFile = 'wrf_fileindex.csv'
    cons = ConsolidateStorage(csvFile=wrfIndexFile)
    cons.getWRFIndexFile()
    cons.consolidate()
