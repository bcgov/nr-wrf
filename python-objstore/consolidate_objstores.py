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
import concurrent.futures
import itertools

import constants
import objStoreUtil

LOGGER = logging.getLogger()


class ConsolidateStorage:

    def __init__(self, csvFile=None):
        self.csvFile = constants.INDEX_FILE
        if csvFile is None or not os.path.exists(csvFile):
            self.csvFile = os.path.join(constants.TMP_FOLDER, constants.INDEX_FILE)
        LOGGER.debug(f"csv file being used: {self.csvFile}")

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

        # cache for file lists - used to speed up debugging
        self.srcCacheFile = os.path.join(constants.TMP_FOLDER, 'srcfiles.json')
        self.destCacheFile = os.path.join(constants.TMP_FOLDER, 'destfiles.json')
        LOGGER.debug(f"cache dir: {constants.TMP_FOLDER}")

        self.getCsvFile()

    def getCsvFile(self):
        if not os.path.exists(self.csvFile):
            bareCsvFileName = os.path.basename(self.csvFile)
            LOGGER.info(f"retrieving the csv file: {bareCsvFileName}")
            self.destObjStoreUtil.getObject(bareCsvFileName, self.csvFile)
        
    def consolidate(self):
        # bucketRegexStr = f'^.*{constants.OBJ_STORE_BUCKET}$'
        # LOGGER.debug(f"regex str: {bucketRegexStr}")
        # bucketRegex = re.compile(f'^.*{constants.OBJ_STORE_BUCKET}$')

        self.moveFiles()

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

    def getFileLists(self, cache=False):
        """mostly used for debugging, gets a list of source and
        destination files and then caches the results to files in the 
        data folder.  Caching only takes place is the cache variable is
        set to true
        """

        if cache and os.path.exists(self.srcCacheFile):
            with open(self.srcCacheFile, 'r') as fh:
                srcFiles = json.load(fh)
        else:
            LOGGER.info("getting the source file list")
            srcFiles = self.srcObjStoreUtil.listObjects(returnFileNamesOnly=True)
            if cache:
                with open(self.srcCacheFile, 'w') as fh:
                    json.dump(srcFiles, fh)
        if cache and os.path.exists(self.destCacheFile):
            with open(self.destCacheFile, 'r') as fh:
                destFiles = json.load(fh)
        else:
            LOGGER.info("getting the destination file list")
            destFiles = self.destObjStoreUtil.listObjects(returnFileNamesOnly=True)
            if cache:
                with open(self.destCacheFile, 'w') as fh:
                    json.dump(destFiles, fh)
        return srcFiles, destFiles

    def moveFiles(self):
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
                    self.moveFile(srcFile)
        except:
            LOGGER.warning("error detected, caching file copy status")
            self.cacheSrcDest(srcFiles, destFiles)
            raise

    def moveFile(self, srcFile):
        tmpPath = os.path.join(constants.TMP_FOLDER, srcFile)
        if os.path.exists(tmpPath):
            os.remove(tmpPath)
        LOGGER.debug(f"getting the file: {srcFile}")
        self.srcObjStoreUtil.getObject(srcFile, tmpPath)
        LOGGER.debug(f"putting the file: {srcFile}")
        self.destObjStoreUtil.putObject(srcFile, tmpPath)
        #srcFiles.remove(srcFile)
        #destFiles.append(srcFile)
        self.destObjStoreUtil.setPublicPermissions(srcFile)
        LOGGER.info(f"moved and set permissions on {srcFile}")
        # remove the temp file
        if os.path.exists(tmpPath):
            os.remove(tmpPath)

    def moveFilesAsync(self):
        """
        
        https://alexwlchan.net/2019/10/adventures-with-concurrent-futures/
        """
        srcFiles, destFiles = self.getFileLists()
        LOGGER.info(f"file to move: {len(srcFiles)}")
        LOGGER.info(f"files in destination: {len(destFiles)}")

        self.srcObjStoreUtil.createBotoClient()
        self.destObjStoreUtil.createBotoClient()

        CONCURRENT_TASKS_BUNDLE = 10
        #MAX_WORKERS = 10

        files2Move = []
        for srcFile in srcFiles:
            if srcFile not in destFiles:
                files2Move.append(srcFile)
        LOGGER.info(f"files to be moved: {len(files2Move)}")

        # debugging
        #files2Move = files2Move[:200]

        files2MoveIter = iter(files2Move)

        completed = 0

        with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENT_TASKS_BUNDLE) as executor:
            futures = {}
            cnt = 0
            for file2Move in itertools.islice(files2MoveIter, CONCURRENT_TASKS_BUNDLE):
                fut = executor.submit(self.moveFile, file2Move)
                futures[fut] = file2Move
                cnt += 1
            LOGGER.info(f'stack size: {cnt}')

            while futures:
                done, _ = concurrent.futures.wait(
                    futures, return_when=concurrent.futures.FIRST_COMPLETED
                )
                completed += len(done)
                if not completed % 100:
                    LOGGER.debug(
                        f"total completed: {completed} of {len(files2Move)} (pkgs in loop: {len(done)})"
                    )
                for fut in done:
                    futures.pop(fut)
                    # you can retrieve the original task using: futures.pop(fut)
                    # can add error catching and re-add to executor here
                    data = fut.result()
                for file2Move in itertools.islice(files2MoveIter, len(done)):
                    # LOGGER.debug(f"adding: {pkgName} to the queue")
                    # adding the package name to the url, as a param
                    fut = executor.submit(self.moveFile, file2Move)
                    futures[fut] = file2Move

        
    def publishFile(self, fileName):
        LOGGER.debug(f"publishing filename: {fileName}")
        self.destObjStoreUtil.setPublicPermissions(fileName)   

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
    #LOGGER.setLevel(logging.DEBUG)
    LOGGER.setLevel(logging.INFO)
    hndlr = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(lineno)d - %(message)s')
    hndlr.setFormatter(formatter)
    LOGGER.addHandler(hndlr)
    LOGGER.debug("test")

    urllibLog = logging.getLogger('urllib3.connectionpool')
    urllibLog.setLevel(logging.INFO)

    botoLogTypes = ['botocore.retryhandler', 'botocore.hooks', 'botocore.parsers',
                'botocore.httpsession', 'botocore.endpoint', 'botocore.auth',
                'botocore.loaders', 'botocore.client']
    for botoLogType in botoLogTypes:
        botoLog = logging.getLogger(botoLogType)
        botoLog.setLevel(logging.INFO)

    utilLog = logging.getLogger('objStoreUtil')
    utilLog.setLevel(logging.INFO)

    cons = ConsolidateStorage()
    #cons.consolidate()
    cons.moveFilesAsync()
