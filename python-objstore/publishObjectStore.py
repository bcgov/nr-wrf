import logging

import objStoreUtil

LOGGER = logging.getLogger()


if __name__ == "__main__":
    """script will:
    1. configure a logger
    2. connect to objects store
    3. get a list of the objects
    4. for each object identify if its public and if not make it public
    """

    # LOGGER.setLevel(logging.DEBUG)
    LOGGER.setLevel(logging.INFO)

    hndlr = logging.StreamHandler()
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s"
        + " - %(lineno)d - %(message)s"
    )
    hndlr.setFormatter(formatter)
    LOGGER.addHandler(hndlr)
    LOGGER.debug("test")

    objUtil = objStoreUtil.ObjectStoreUtil()
    objList = objUtil.listObjects()

    cnt = 1
    for obj in objList:
        objStoreObjDict = objUtil.getObjAsDict(obj)
        LOGGER.info(f"checking object: {objStoreObjDict['object_name']}")
        LOGGER.debug(f"objStoreObjDict: {objStoreObjDict}")
        pubPerms = objUtil.getPublicPermission(objStoreObjDict["object_name"])
        if pubPerms is None:
            LOGGER.info(
                "making the object: "
                + f"{objStoreObjDict['object_name']} public"
            )
            objUtil.setPublicPermissions(objStoreObjDict["object_name"])
        # Testing... limit the number of iterations
        # if cnt > 20:
        #     raise
        cnt += 1
    # pub.statObject(constants.TEST_OBJ_NAME)
    # pubPermission = pub.getPublicPermission(constants.TEST_OBJ_NAME)
    # pub.setPublicPermissions(constants.TEST_OBJ_NAME)

    # objUtil.testPutPerms()
