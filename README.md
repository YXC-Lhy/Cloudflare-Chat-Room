# Cloudflare-Chat-Room
利用Cloudflare免费D1存储和pages搭建聊天室网站
## 部署步骤  
1.创建pages，压缩上传_worker.js（里面的设置参数需调）   
2.创建D1存储，绑定到pages，名字设为DB，打开/init初始化D1或在D1控制台输入D1.txt里的CREATE指令来初始化  
3.打开_redirects，把https后的域名改为你的第一个pages的域名，类型307不要改  
4.压缩web_ui里的所有文件，创建第二个pages并上传  
5.注册邀请码为_worker.js里的INVITE_CODE
